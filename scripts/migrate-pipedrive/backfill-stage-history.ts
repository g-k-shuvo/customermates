/**
 * One-off backfill for migrated deals: rewrites DealStageHistory, Deal.stageEnteredAt and
 * Deal.rottingAt from Pipedrive's deal flow, because the migration replays stage changes through
 * the REST API and so stamps every history row with the migration's own time.
 *
 *   yarn migrate:pipedrive:stage-history --source-dir ./pipedrive-export            (dry run)
 *   yarn migrate:pipedrive:stage-history --source-dir ./pipedrive-export --apply
 *
 * Deals are matched through their `pipedrive_id` custom field, pipelines and stages by name, the
 * same way the migration matched them. A deal whose history already matches is left alone, so a
 * re-run writes nothing. Writes go straight to the database (REST cannot set history timestamps),
 * one transaction per deal.
 */

import "dotenv/config";

import type { PipedriveSourceConfig } from "./config";

import { PrismaPg } from "@prisma/adapter-pg";

import { computeRottingAt } from "@/features/deals/deal-rotting";
import { DealStatus, EntityType, PrismaClient } from "@/generated/prisma";

import { assertTargetAllowed, describeDatasource, resolveDatasource } from "../repair-notes/datasource";
import { mapStage, PIPEDRIVE_ID_COLUMN } from "./mapping";
import { createPipedriveSource } from "./pipedrive-source";
import { parsePipedriveDate, referenceId } from "./pipedrive.types";
import { historyRowsFromVisits, isSameHistory, planStageVisits, readStageChanges } from "./stage-history-backfill";

const USAGE = `Usage: yarn migrate:pipedrive:stage-history (--source-dir <dir> | --pipedrive-domain <d> --pipedrive-token <t>)
                                          [--company <id>] [--apply] [--allow-remote]

Dry run by default: prints what would change. --apply writes. --company is required when more than
one workspace holds migrated deals.`;

type Options = { source: PipedriveSourceConfig; apply: boolean; allowRemote: boolean; companyId?: string };

function parseArgs(argv: readonly string[], environment: NodeJS.ProcessEnv): Options {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const known = new Set([
    "--source-dir",
    "--pipedrive-domain",
    "--pipedrive-token",
    "--company",
    "--apply",
    "--allow-remote",
    "--help",
  ]);
  for (const arg of argv)
    if (arg.startsWith("--") && !known.has(arg)) throw new Error(`Unknown argument "${arg}".\n\n${USAGE}`);

  const directory = value("--source-dir") ?? environment.PIPEDRIVE_EXPORT_DIR?.trim();
  const domain = value("--pipedrive-domain") ?? environment.PIPEDRIVE_DOMAIN?.trim();
  const token = value("--pipedrive-token") ?? environment.PIPEDRIVE_API_TOKEN?.trim();
  let source: PipedriveSourceConfig;
  if (directory) source = { kind: "directory", path: directory };
  else if (domain && token) source = { kind: "api", domain, token };
  else throw new Error(`No Pipedrive source.\n\n${USAGE}`);

  return {
    source,
    apply: argv.includes("--apply"),
    allowRemote: argv.includes("--allow-remote"),
    companyId: value("--company")?.toLowerCase(),
  };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  const options = parseArgs(argv, process.env);
  const datasource = resolveDatasource(process.env);
  assertTargetAllowed(datasource, options.allowRemote);
  process.stdout.write(`${describeDatasource(datasource)}${options.apply ? "" : " (dry run)"}\n`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: datasource.url }) });
  const source = createPipedriveSource(options.source);

  try {
    const columns = await prisma.customColumn.findMany({
      where: {
        entityType: EntityType.deal,
        label: PIPEDRIVE_ID_COLUMN,
        ...(options.companyId ? { companyId: options.companyId } : {}),
      },
      select: { id: true, companyId: true },
    });
    if (columns.length === 0) throw new Error(`No deal "${PIPEDRIVE_ID_COLUMN}" column found. Has the migration run?`);
    if (columns.length > 1) throw new Error("More than one workspace holds migrated deals. Pass --company <id>.");
    const [{ id: columnId, companyId }] = columns;

    const [pipelines, stages, deals, crmPipelines, pipedriveIds] = await Promise.all([
      source.pipelines(),
      source.stages(),
      source.deals(),
      prisma.pipeline.findMany({
        where: { companyId },
        select: { id: true, name: true, stages: { select: { id: true, name: true, rottingDays: true } } },
      }),
      prisma.customFieldValue.findMany({ where: { companyId, columnId }, select: { value: true, dealId: true } }),
    ]);

    const crmPipelineByName = new Map(crmPipelines.map((pipeline) => [pipeline.name.trim().toLowerCase(), pipeline]));
    const pipelineNameById = new Map(
      pipelines.map((pipeline) => [
        pipeline.id,
        String(pipeline.name ?? "")
          .trim()
          .toLowerCase(),
      ]),
    );
    const stageIdByPipedriveId = new Map<number, string>();
    const rottingDaysByStageId = new Map<string, number | null>();
    for (const pipeline of crmPipelines)
      for (const stage of pipeline.stages) rottingDaysByStageId.set(stage.id, stage.rottingDays);
    for (const stage of stages) {
      const pipelineId = referenceId(stage.pipeline_id);
      const target = pipelineId === null ? undefined : crmPipelineByName.get(pipelineNameById.get(pipelineId) ?? "");
      const name = mapStage(stage)?.name.toLowerCase();
      const match = target?.stages.find((candidate) => candidate.name.trim().toLowerCase() === name);
      if (match) stageIdByPipedriveId.set(stage.id, match.id);
    }

    const dealIdByPipedriveId = new Map<number, string>();
    for (const row of pipedriveIds) {
      const pipedriveId = Number(row.value);
      if (row.dealId && Number.isInteger(pipedriveId)) dealIdByPipedriveId.set(pipedriveId, row.dealId);
    }

    const tally = { checked: 0, rebuilt: 0, unchanged: 0, skipped: 0 };
    for (const deal of deals) {
      const dealId = dealIdByPipedriveId.get(deal.id);
      if (!dealId) continue;
      tally.checked += 1;

      const crmDeal = await prisma.deal.findFirst({
        where: { id: dealId, companyId },
        select: {
          id: true,
          stageId: true,
          status: true,
          stageHistory: {
            select: { toStageId: true, enteredAt: true, exitedAt: true },
            orderBy: [{ enteredAt: "asc" }, { id: "asc" }],
          },
        },
      });
      if (!crmDeal) {
        tally.skipped += 1;
        continue;
      }

      const visits = planStageVisits({
        addedAt: parsePipedriveDate(deal.add_time),
        closedAt: parsePipedriveDate(deal.won_time ?? deal.lost_time ?? deal.close_time),
        changes: readStageChanges(await source.dealFlow(deal.id)),
        stageIdByPipedriveId,
        currentStageId: crmDeal.stageId,
        closedInCrm: crmDeal.status !== DealStatus.open,
      });
      const rows = historyRowsFromVisits(visits);
      if (rows.length === 0) {
        tally.skipped += 1;
        continue;
      }
      if (isSameHistory(crmDeal.stageHistory, rows)) {
        tally.unchanged += 1;
        continue;
      }

      tally.rebuilt += 1;
      if (!options.apply) continue;

      const current = rows[rows.length - 1];
      await prisma.$transaction([
        prisma.dealStageHistory.deleteMany({ where: { companyId, dealId } }),
        prisma.dealStageHistory.createMany({ data: rows.map((row) => ({ ...row, companyId, dealId })) }),
        prisma.deal.updateMany({
          where: { id: dealId, companyId },
          data: {
            stageEnteredAt: current.enteredAt,
            rottingAt: computeRottingAt(crmDeal.status, current.enteredAt, rottingDaysByStageId.get(current.toStageId)),
          },
        }),
      ]);
    }

    process.stdout.write(
      `Checked ${tally.checked} migrated deal(s): ${tally.rebuilt} ${options.apply ? "rebuilt" : "would be rebuilt"}, ${tally.unchanged} already right, ${tally.skipped} skipped.\n`,
    );
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
