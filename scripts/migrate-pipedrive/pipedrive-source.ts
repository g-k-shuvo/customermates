/**
 * Reads the Pipedrive side of the migration, either from an on-disk export
 * (a directory of JSON files) or straight from the Pipedrive v1 REST API.
 */

import type { PipedriveSourceConfig } from "./config";
import type {
  PipedriveActivity,
  PipedriveDeal,
  PipedriveDealField,
  PipedriveFlowEntry,
  PipedriveNote,
  PipedriveOrganization,
  PipedrivePerson,
  PipedrivePipeline,
  PipedriveRecord,
  PipedriveStage,
  PipedriveUser,
} from "./pipedrive.types";

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export type PipedriveSource = {
  users(): Promise<PipedriveUser[]>;
  organizations(): Promise<PipedriveOrganization[]>;
  persons(): Promise<PipedrivePerson[]>;
  pipelines(): Promise<PipedrivePipeline[]>;
  stages(): Promise<PipedriveStage[]>;
  dealFields(): Promise<PipedriveDealField[]>;
  deals(): Promise<PipedriveDeal[]>;
  dealFlow(dealId: number): Promise<PipedriveFlowEntry[]>;
  activities(): Promise<PipedriveActivity[]>;
  notes(): Promise<PipedriveNote[]>;
};

/**
 * Accepts a bare array, the Pipedrive envelope `{ data: [...] }`, or JSON Lines,
 * because every Pipedrive export tool in the wild produces a different one.
 */
export function parseRecords<T extends PipedriveRecord>(raw: string, origin: string): T[] {
  const text = raw.trim();
  if (text === "") return [];

  if (!text.startsWith("[") && !text.startsWith("{")) throw new Error(`${origin} is not JSON.`);

  if (text.startsWith("{") && text.includes("\n{") && !text.includes('"data"')) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as T);
  }

  const parsed: unknown = JSON.parse(text);

  if (Array.isArray(parsed)) return parsed as T[];

  if (parsed && typeof parsed === "object") {
    const data = (parsed as { data?: unknown }).data;
    if (Array.isArray(data)) return data as T[];
    if (data === null) return [];
  }

  throw new Error(`${origin} did not contain an array of records.`);
}

const DIRECTORY_FILES = {
  users: "users.json",
  organizations: "organizations.json",
  persons: "persons.json",
  pipelines: "pipelines.json",
  stages: "stages.json",
  dealFields: "dealFields.json",
  deals: "deals.json",
  activities: "activities.json",
  notes: "notes.json",
  dealFlow: "deal-flow.json",
} as const;

async function readOptional<T extends PipedriveRecord>(directory: string, file: string): Promise<T[]> {
  try {
    return parseRecords<T>(await readFile(join(directory, file), "utf8"), file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/**
 * A mistyped `--source-dir` must not read as "the export was empty", so the
 * directory is checked once and has to contain at least one recognised file.
 */
async function assertUsableExport(directory: string): Promise<void> {
  const stats = await stat(directory).catch(() => null);
  if (!stats?.isDirectory()) throw new Error(`The Pipedrive export directory ${directory} does not exist.`);

  const present = new Set(await readdir(directory));
  const known = Object.values(DIRECTORY_FILES).filter((file) => present.has(file));

  if (known.length === 0) {
    throw new Error(
      `${directory} contains none of the expected Pipedrive export files (${Object.values(DIRECTORY_FILES).join(", ")}).`,
    );
  }
}

function createDirectorySource(directory: string): PipedriveSource {
  let flowByDealId: Map<number, PipedriveFlowEntry[]> | null = null;
  let checked: Promise<void> | null = null;

  const read = async <T extends PipedriveRecord>(file: string): Promise<T[]> => {
    checked ??= assertUsableExport(directory);
    await checked;

    return await readOptional<T>(directory, file);
  };

  const loadFlow = async () => {
    if (flowByDealId) return flowByDealId;

    const entries = await read<PipedriveFlowEntry>(DIRECTORY_FILES.dealFlow);
    const grouped = new Map<number, PipedriveFlowEntry[]>();

    for (const entry of entries) {
      const itemId = Number(entry.data?.item_id ?? entry.deal_id);
      if (!Number.isFinite(itemId)) continue;

      const bucket = grouped.get(itemId) ?? [];
      bucket.push(entry);
      grouped.set(itemId, bucket);
    }

    flowByDealId = grouped;

    return grouped;
  };

  return {
    users: () => read<PipedriveUser>(DIRECTORY_FILES.users),
    organizations: () => read<PipedriveOrganization>(DIRECTORY_FILES.organizations),
    persons: () => read<PipedrivePerson>(DIRECTORY_FILES.persons),
    pipelines: () => read<PipedrivePipeline>(DIRECTORY_FILES.pipelines),
    stages: () => read<PipedriveStage>(DIRECTORY_FILES.stages),
    dealFields: () => read<PipedriveDealField>(DIRECTORY_FILES.dealFields),
    deals: () => read<PipedriveDeal>(DIRECTORY_FILES.deals),
    dealFlow: async (dealId) => (await loadFlow()).get(dealId) ?? [],
    activities: () => read<PipedriveActivity>(DIRECTORY_FILES.activities),
    notes: () => read<PipedriveNote>(DIRECTORY_FILES.notes),
  };
}

const API_PAGE_SIZE = 500;

function createApiSource(domain: string, token: string): PipedriveSource {
  const origin = domain.startsWith("http") ? domain.replace(/\/+$/u, "") : `https://${domain}.pipedrive.com`;

  const request = async <T extends PipedriveRecord>(path: string, query: Record<string, string> = {}): Promise<T[]> => {
    const collected: T[] = [];
    let start = 0;

    for (;;) {
      const url = new URL(`${origin}/api/v1/${path}`);
      url.searchParams.set("api_token", token);
      url.searchParams.set("limit", String(API_PAGE_SIZE));
      url.searchParams.set("start", String(start));
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`Pipedrive GET /${path} failed with ${response.status}.`);

      const body = (await response.json()) as {
        data?: T[] | null;
        additional_data?: { pagination?: { more_items_in_collection?: boolean; next_start?: number } };
      };

      collected.push(...(body.data ?? []));

      const pagination = body.additional_data?.pagination;
      if (!pagination?.more_items_in_collection) return collected;

      start = pagination.next_start ?? start + API_PAGE_SIZE;
    }
  };

  return {
    users: () => request<PipedriveUser>("users"),
    organizations: () => request<PipedriveOrganization>("organizations"),
    persons: () => request<PipedrivePerson>("persons"),
    pipelines: () => request<PipedrivePipeline>("pipelines"),
    stages: () => request<PipedriveStage>("stages"),
    dealFields: () => request<PipedriveDealField>("dealFields"),
    deals: () => request<PipedriveDeal>("deals", { status: "all_not_deleted" }),
    dealFlow: (dealId) => request<PipedriveFlowEntry>(`deals/${dealId}/flow`),
    activities: () => request<PipedriveActivity>("activities", { user_id: "0" }),
    notes: () => request<PipedriveNote>("notes"),
  };
}

export function createPipedriveSource(config: PipedriveSourceConfig): PipedriveSource {
  return config.kind === "directory"
    ? createDirectorySource(config.path)
    : createApiSource(config.domain, config.token);
}
