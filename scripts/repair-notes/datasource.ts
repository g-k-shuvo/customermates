import type { ClientConfig } from "pg";

import { parse } from "pg-connection-string";

import { LIBPQ_ROUTING_VARIABLES } from "../local-database-safety";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const DEFAULT_PORT = 5432;
const REDIRECTING_VARIABLES = [...LIBPQ_ROUTING_VARIABLES, "PGOPTIONS"] as const;

export type DatasourceVariable = "DIRECT_URL" | "DATABASE_URL";

type Target = { host: string; port: number; database: string; local: boolean; connection: ClientConfig };

export type Datasource = Target & { url: string; variable: DatasourceVariable };

export class DatasourceError extends Error {}

function addressOf(target: { host: string; port: number; database: string }): string {
  const host = target.host.includes(":") ? `[${target.host}]` : target.host;

  return `${host}:${target.port}/${target.database}`;
}

function locate(url: string, variable: DatasourceVariable): Target {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new DatasourceError(`${variable} is not a valid PostgreSQL URL.`);
  }
  if (!POSTGRES_PROTOCOLS.has(parsedUrl.protocol)) throw new DatasourceError(`${variable} must use PostgreSQL.`);

  const parsed = parse(url);
  const host = (parsed.host ?? "").replace(/^\[(.*)\]$/u, "$1");
  const database = parsed.database ?? "";
  const port = parsed.port ? Number(parsed.port) : DEFAULT_PORT;

  if (!host) throw new DatasourceError(`${variable} names no host.`);
  if (!database) throw new DatasourceError(`${variable} names no database.`);
  if (!Number.isInteger(port) || port <= 0) throw new DatasourceError(`${variable} names an invalid port.`);
  if (parsed.options) {
    throw new DatasourceError(
      `${variable} sets connection options ("${String(parsed.options)}"). Remove them: they can point the tables this tool reads at another schema.`,
    );
  }
  if (parsed.schema !== undefined && parsed.schema !== "public")
    throw new DatasourceError(`${variable} selects schema "${String(parsed.schema)}"; this tool only reads "public".`);

  const connection: ClientConfig = { host, port, database };
  if (parsed.user) connection.user = parsed.user;
  if (parsed.password !== undefined) connection.password = parsed.password;
  if (parsed.ssl !== undefined) connection.ssl = parsed.ssl as ClientConfig["ssl"];

  return {
    host,
    port,
    database,
    local: LOOPBACK_HOSTS.has(parsedUrl.hostname) && LOOPBACK_HOSTS.has(host),
    connection,
  };
}

export function resolveDatasource(environment: Record<string, string | undefined>): Datasource {
  const redirecting = REDIRECTING_VARIABLES.filter((name) => (environment[name] ?? "") !== "");
  if (redirecting.length > 0) {
    throw new DatasourceError(
      `${redirecting.join(", ")} must be unset: libpq settings like these can redirect the connection away from the database this tool names.`,
    );
  }

  const direct = environment.DIRECT_URL?.trim();
  const pooled = environment.DATABASE_URL?.trim();
  const url = direct || pooled;
  if (!url) throw new DatasourceError("Set DIRECT_URL or DATABASE_URL to the database whose notes should be repaired.");

  const variable: DatasourceVariable = direct ? "DIRECT_URL" : "DATABASE_URL";
  const target = { ...locate(url, variable), url, variable };

  if (direct && pooled) {
    const other = locate(pooled, "DATABASE_URL");
    if (addressOf(other) !== addressOf(target)) {
      throw new DatasourceError(
        `DIRECT_URL points at ${addressOf(target)} but DATABASE_URL points at ${addressOf(other)}. ` +
          "This tool follows DIRECT_URL, as prisma.config.ts does, so point both at the database you mean " +
          "(or leave one of them empty) before running it.",
      );
    }
  }

  return target;
}

export function assertTargetAllowed(datasource: Datasource, allowRemote: boolean): void {
  if (datasource.local || allowRemote) return;

  throw new DatasourceError(
    `Refusing to run against a non-local database (${addressOf(datasource)} from ${datasource.variable}). ` +
      "Pass --allow-remote once you have confirmed this is the database to repair.",
  );
}

export function describeDatasource(datasource: Datasource): string {
  return `Datasource: ${addressOf(datasource)} (from ${datasource.variable}${datasource.local ? "" : ", remote"})`;
}
