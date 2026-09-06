/**
 * Configuration for the Pipedrive migration. Everything can be supplied as an
 * environment variable or overridden on the command line; see README.md.
 */

import { Currency } from "@/generated/prisma";

import { MIGRATION_ENTITIES, type MigrationEntity } from "./reconciliation";

export type PipedriveSourceConfig =
  | { kind: "directory"; path: string }
  | { kind: "api"; domain: string; token: string };

export type MigrationConfig = {
  dryRun: boolean;
  baseUrl: string;
  apiKey: string;
  source: PipedriveSourceConfig;
  fallbackOwnerEmail: string | null;
  defaultCurrency: Currency;
  wonStageName: string;
  lostStageName: string;
  makeFirstPipelineDefault: boolean;
  only: MigrationEntity[] | null;
  limit: number | null;
  reportPath: string | null;
  provisionColumns: boolean;
  updateExisting: boolean;
};

export class ConfigurationError extends Error {}

const FLAGS_WITHOUT_VALUE = new Set([
  "--dry-run",
  "--make-default-pipeline",
  "--skip-column-provisioning",
  "--update-existing",
  "--help",
]);

export function parseArgv(argv: readonly string[]): Map<string, string> {
  const parsed = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new ConfigurationError(`Unexpected argument "${token}".`);

    if (FLAGS_WITHOUT_VALUE.has(token)) {
      parsed.set(token, "true");
      continue;
    }

    const inline = token.indexOf("=");
    if (inline > 0) {
      parsed.set(token.slice(0, inline), token.slice(inline + 1));
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new ConfigurationError(`Option "${token}" needs a value.`);

    parsed.set(token, value);
    index += 1;
  }

  return parsed;
}

function trimmed(value: string | undefined): string | null {
  if (typeof value !== "string") return null;

  const result = value.trim();

  return result === "" ? null : result;
}

function parseCurrency(value: string | null): Currency {
  if (!value) return Currency.eur;

  const lower = value.toLowerCase();
  const known = Object.values(Currency).find((candidate) => candidate === lower);
  if (!known) throw new ConfigurationError(`Unknown currency "${value}".`);

  return known;
}

function parseOnly(value: string | null): MigrationEntity[] | null {
  if (!value) return null;

  const requested = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");

  const unknown = requested.filter((entry) => !MIGRATION_ENTITIES.includes(entry as MigrationEntity));
  if (unknown.length > 0) {
    throw new ConfigurationError(
      `Unknown --only entities: ${unknown.join(", ")}. Known: ${MIGRATION_ENTITIES.join(", ")}.`,
    );
  }

  return requested as MigrationEntity[];
}

function parseLimit(value: string | null): number | null {
  if (!value) return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new ConfigurationError(`--limit must be a positive integer.`);

  return parsed;
}

export function resolveConfig(argv: readonly string[], environment: NodeJS.ProcessEnv = process.env): MigrationConfig {
  const options = parseArgv(argv);
  const option = (name: string) => trimmed(options.get(name));

  const baseUrl = option("--base-url") ?? trimmed(environment.CRM_BASE_URL) ?? "http://localhost:4000";
  const apiKey = option("--api-key") ?? trimmed(environment.CRM_API_KEY);
  if (!apiKey) {
    throw new ConfigurationError(
      "An API key is required. Set CRM_API_KEY or pass --api-key. Create one under Profile -> API Keys.",
    );
  }

  const sourceDirectory = option("--source-dir") ?? trimmed(environment.PIPEDRIVE_EXPORT_DIR);
  const domain = option("--pipedrive-domain") ?? trimmed(environment.PIPEDRIVE_DOMAIN);
  const token = option("--pipedrive-token") ?? trimmed(environment.PIPEDRIVE_API_TOKEN);

  let source: PipedriveSourceConfig;
  if (sourceDirectory) source = { kind: "directory", path: sourceDirectory };
  else if (domain && token) source = { kind: "api", domain, token };
  else {
    throw new ConfigurationError(
      "No Pipedrive source. Pass --source-dir <dir> for an on-disk export, or --pipedrive-domain and --pipedrive-token to read the API.",
    );
  }

  return {
    dryRun: options.has("--dry-run"),
    baseUrl: baseUrl.replace(/\/+$/u, ""),
    apiKey,
    source,
    fallbackOwnerEmail:
      (option("--fallback-owner") ?? trimmed(environment.MIGRATION_FALLBACK_OWNER_EMAIL))?.toLowerCase() ?? null,
    defaultCurrency: parseCurrency(option("--default-currency") ?? trimmed(environment.MIGRATION_DEFAULT_CURRENCY)),
    wonStageName: option("--won-stage-name") ?? "Won",
    lostStageName: option("--lost-stage-name") ?? "Lost",
    makeFirstPipelineDefault: options.has("--make-default-pipeline"),
    only: parseOnly(option("--only")),
    limit: parseLimit(option("--limit")),
    reportPath: option("--report"),
    provisionColumns: !options.has("--skip-column-provisioning"),
    updateExisting: options.has("--update-existing"),
  };
}

export const USAGE = `Usage: tsx scripts/migrate-pipedrive [options]

Target (required)
  --api-key <key>              CRM API key (env CRM_API_KEY)
  --base-url <url>             CRM base URL (env CRM_BASE_URL, default http://localhost:4000)

Source (one of)
  --source-dir <dir>           Directory of Pipedrive JSON exports (env PIPEDRIVE_EXPORT_DIR)
  --pipedrive-domain <domain>  Pipedrive company domain (env PIPEDRIVE_DOMAIN)
  --pipedrive-token <token>    Pipedrive API token (env PIPEDRIVE_API_TOKEN)

Options
  --dry-run                    Report counts and unmapped values, write nothing
  --fallback-owner <email>     Owner for records whose Pipedrive user has no match
  --default-currency <code>    Currency for monetary custom columns (default eur)
  --only <entities>            Comma separated subset of the migration phases
  --limit <n>                  Cap the number of source records per entity
  --won-stage-name <name>      Terminal won stage name (default Won)
  --lost-stage-name <name>     Terminal lost stage name (default Lost)
  --make-default-pipeline      Mark the first imported pipeline as the default
  --skip-column-provisioning   Fail instead of creating missing pipedrive_* columns
  --update-existing            Re-apply the mapping to records a previous run created
  --report <path>              Also write the reconciliation report to this file
  --help                       Print this message
`;
