/**
 * One-off conversion for deals migrated before Deal.baseValue existed. Those runs carried each
 * deal's Pipedrive value on a unit-priced "Pipedrive deal value" service with quantity = value.
 * This moves that amount into Deal.baseValue, removes the service line, recomputes totalQuantity
 * (totalValue and weightedValue do not change), and deletes the service once nothing uses it.
 *
 *   yarn migrate:pipedrive:base-value            (dry run)
 *   yarn migrate:pipedrive:base-value --apply
 *
 * One transaction per deal. A converted deal has no value-service line left, so a re-run skips
 * it; an interrupted run is finished by running again. Writes go straight to the database, the
 * same way the stage-history backfill does, so they do not appear in the audit log.
 */

import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { effectiveProbability } from "@/features/deals/deal-weighting";
import { PrismaClient } from "@/generated/prisma";

import { assertTargetAllowed, describeDatasource, resolveDatasource } from "../repair-notes/datasource";
import { planBaseValueMove } from "./base-value-move";
import { DEAL_VALUE_SERVICE_NAME } from "./mapping";

const USAGE = `Usage: yarn migrate:pipedrive:base-value [--company <id>] [--apply] [--allow-remote]

Dry run by default: prints what would change. --apply writes. --company is required when more than
one workspace holds a "${DEAL_VALUE_SERVICE_NAME}" service.`;

type Options = { apply: boolean; allowRemote: boolean; companyId?: string };

function parseArgs(argv: readonly string[]): Options {
  const known = new Set(["--company", "--apply", "--allow-remote", "--help"]);
  for (const arg of argv)
    if (arg.startsWith("--") && !known.has(arg)) throw new Error(`Unknown argument "${arg}".\n\n${USAGE}`);
  const companyIndex = argv.indexOf("--company");

  return {
    apply: argv.includes("--apply"),
    allowRemote: argv.includes("--allow-remote"),
    companyId: companyIndex >= 0 ? argv[companyIndex + 1]?.toLowerCase() : undefined,
  };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  const options = parseArgs(argv);
  const datasource = resolveDatasource(process.env);
  assertTargetAllowed(datasource, options.allowRemote);
  process.stdout.write(`${describeDatasource(datasource)}${options.apply ? "" : " (dry run)"}\n`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: datasource.url }),
  });

  try {
    const services = await prisma.service.findMany({
      where: {
        name: DEAL_VALUE_SERVICE_NAME,
        ...(options.companyId ? { companyId: options.companyId } : {}),
      },
      select: { id: true, companyId: true },
    });
    if (services.length === 0) {
      process.stdout.write(`No "${DEAL_VALUE_SERVICE_NAME}" service found. Nothing to move.\n`);
      return 0;
    }
    if (new Set(services.map((service) => service.companyId)).size > 1)
      throw new Error(`More than one workspace holds a "${DEAL_VALUE_SERVICE_NAME}" service. Pass --company <id>.`);

    const tally = { deals: 0, moved: 0, servicesDeleted: 0 };
    for (const service of services) {
      const { companyId } = service;
      const deals = await prisma.deal.findMany({
        where: { companyId, services: { some: { serviceId: service.id } } },
        select: {
          id: true,
          baseValue: true,
          probability: true,
          stage: { select: { probability: true } },
          services: {
            select: {
              serviceId: true,
              quantity: true,
              service: { select: { amount: true } },
            },
          },
        },
      });

      for (const deal of deals) {
        const move = planBaseValueMove(
          {
            dealId: deal.id,
            baseValue: deal.baseValue,
            weight: effectiveProbability(deal.probability, deal.stage?.probability),
            lines: deal.services.map((line) => ({
              serviceId: line.serviceId,
              amount: line.service.amount,
              quantity: line.quantity,
            })),
          },
          service.id,
        );
        if (!move) continue;
        tally.deals += 1;
        tally.moved += move.moved;
        if (!options.apply) continue;

        await prisma.$transaction([
          prisma.deal.updateMany({
            where: { id: deal.id, companyId },
            data: {
              baseValue: move.baseValue,
              totalValue: move.totalValue,
              totalQuantity: move.totalQuantity,
              weightedValue: move.weightedValue,
            },
          }),
          prisma.serviceDeal.deleteMany({
            where: { companyId, dealId: deal.id, serviceId: service.id },
          }),
        ]);
      }

      if (!options.apply) continue;
      const [dealLines, taskLines] = await Promise.all([
        prisma.serviceDeal.count({
          where: { companyId, serviceId: service.id },
        }),
        prisma.taskService.count({
          where: { companyId, serviceId: service.id },
        }),
      ]);
      if (dealLines === 0 && taskLines === 0) {
        await prisma.service.deleteMany({
          where: { id: service.id, companyId },
        });
        tally.servicesDeleted += 1;
      }
    }

    process.stdout.write(
      options.apply
        ? `Moved ${tally.moved} into baseValue on ${tally.deals} deal(s); deleted ${tally.servicesDeleted} "${DEAL_VALUE_SERVICE_NAME}" service(s).\n`
        : `Would move ${tally.moved} into baseValue on ${tally.deals} deal(s), then delete the "${DEAL_VALUE_SERVICE_NAME}" service.\n`,
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
