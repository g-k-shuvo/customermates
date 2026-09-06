/**
 * CLI entrypoint for the one-off Pipedrive migration.
 *
 *   yarn migrate:pipedrive --dry-run --source-dir ./pipedrive-export
 *   yarn migrate:pipedrive --source-dir ./pipedrive-export --fallback-owner ops@example.com
 *
 * See README.md for the full configuration, the dry run, the real run and the
 * gaps that need a decision from the client before it is run for real.
 */

import "dotenv/config";

import { writeFile } from "node:fs/promises";

import { ConfigurationError, USAGE, resolveConfig } from "./config";
import { CrmClient } from "./crm-client";
import { dryRunWrites, liveWrites } from "./crm-writes";
import { createPipedriveSource } from "./pipedrive-source";
import { renderReconciliationReport } from "./reconciliation";
import { runMigration } from "./run-migration";

function log(message: string): void {
  console.log(message);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes("--help")) {
    log(USAGE);
    return;
  }

  const config = resolveConfig(argv);
  const client = new CrmClient(config.baseUrl, config.apiKey);
  const writes = config.dryRun ? dryRunWrites() : liveWrites(client);

  const me = await client.whoami();
  log(`Target ${config.baseUrl} as ${me.email}${config.dryRun ? " (dry run)" : ""}`);

  const report = await runMigration({
    config,
    client,
    writes,
    source: createPipedriveSource(config.source),
    log,
  });

  const rendered = renderReconciliationReport(report);
  log("");
  log(rendered);

  if (config.reportPath) {
    await writeFile(config.reportPath, `${rendered}\n`, "utf8");
    log("");
    log(`Report written to ${config.reportPath}`);
  }

  if (!report.reconciled) process.exitCode = 1;
}

main().catch((error: unknown) => {
  if (error instanceof ConfigurationError) {
    console.error(error.message);
    console.error("");
    console.error(USAGE);
    process.exit(1);
  }

  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
