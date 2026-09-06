/**
 * Shapes returned by the Pipedrive v1 REST API, plus the small readers that turn
 * their loose JSON into values the rest of the migration can rely on.
 *
 * Everything here is pure and dependency-free so it can be unit tested and reused
 * by both the directory source (an on-disk export) and the HTTP source.
 */

/**
 * Pipedrive relations arrive either as a bare id, as a stringified id, or as an
 * expanded object — `{ value, name }` for org/person refs, `{ id, email, name }`
 * for owner refs. Callers should never branch on this themselves.
 */
export type PipedriveReference =
  | number
  | string
  | null
  | undefined
  | {
      value?: number | string | null;
      id?: number | string | null;
      name?: string | null;
      email?: string | null;
    };

export type PipedriveContactPoint = {
  label?: string | null;
  value?: string | null;
  primary?: boolean | null;
};

export type PipedriveRecord = Record<string, unknown>;

export type PipedriveUser = PipedriveRecord & {
  id: number;
  name?: string | null;
  email?: string | null;
  active_flag?: boolean | null;
};

export type PipedriveOrganization = PipedriveRecord & {
  id: number;
  name?: string | null;
  owner_id?: PipedriveReference;
  address?: string | null;
  add_time?: string | null;
};

export type PipedrivePerson = PipedriveRecord & {
  id: number;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: PipedriveContactPoint[] | string | null;
  phone?: PipedriveContactPoint[] | string | null;
  org_id?: PipedriveReference;
  owner_id?: PipedriveReference;
};

export type PipedrivePipeline = PipedriveRecord & {
  id: number;
  name?: string | null;
  order_nr?: number | null;
  active?: boolean | null;
  deal_probability?: boolean | null;
};

export type PipedriveStage = PipedriveRecord & {
  id: number;
  name?: string | null;
  order_nr?: number | null;
  pipeline_id?: PipedriveReference;
  deal_probability?: number | null;
  rotten_flag?: boolean | null;
  rotten_days?: number | null;
};

export type PipedriveDealStatus = "open" | "won" | "lost" | "deleted";

export type PipedriveDeal = PipedriveRecord & {
  id: number;
  title?: string | null;
  value?: number | string | null;
  currency?: string | null;
  status?: string | null;
  probability?: number | null;
  expected_close_date?: string | null;
  close_time?: string | null;
  won_time?: string | null;
  lost_time?: string | null;
  add_time?: string | null;
  lost_reason?: string | null;
  pipeline_id?: PipedriveReference;
  stage_id?: PipedriveReference;
  person_id?: PipedriveReference;
  org_id?: PipedriveReference;
  user_id?: PipedriveReference;
  creator_user_id?: PipedriveReference;
};

export type PipedriveActivity = PipedriveRecord & {
  id: number;
  subject?: string | null;
  type?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  duration?: string | null;
  done?: boolean | null;
  note?: string | null;
  public_description?: string | null;
  deal_id?: PipedriveReference;
  person_id?: PipedriveReference;
  org_id?: PipedriveReference;
  user_id?: PipedriveReference;
  add_time?: string | null;
};

export type PipedriveNote = PipedriveRecord & {
  id: number;
  content?: string | null;
  deal_id?: PipedriveReference;
  person_id?: PipedriveReference;
  org_id?: PipedriveReference;
  user_id?: PipedriveReference;
  add_time?: string | null;
};

export type PipedriveFieldOption = {
  id?: number | string | null;
  label?: string | null;
};

export type PipedriveDealField = PipedriveRecord & {
  id: number;
  key?: string | null;
  name?: string | null;
  field_type?: string | null;
  edit_flag?: boolean | null;
  options?: PipedriveFieldOption[] | null;
};

export type PipedriveFlowEntry = PipedriveRecord & {
  object?: string | null;
  timestamp?: string | null;
  data?: PipedriveRecord | null;
};

function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}

/** Reads the numeric Pipedrive id out of any of the reference shapes above. */
export function referenceId(reference: PipedriveReference): number | null {
  if (reference === null || reference === undefined) return null;
  if (typeof reference === "number" || typeof reference === "string") return numeric(reference);

  return numeric(reference.value ?? reference.id);
}

/** Reads the display name out of an expanded reference, when one is present. */
export function referenceName(reference: PipedriveReference): string | null {
  if (reference === null || reference === undefined) return null;
  if (typeof reference === "number" || typeof reference === "string") return null;

  const name = reference.name;

  return typeof name === "string" && name.trim() !== "" ? name.trim() : null;
}

/** Reads the email out of an expanded owner reference, when one is present. */
export function referenceEmail(reference: PipedriveReference): string | null {
  if (reference === null || reference === undefined) return null;
  if (typeof reference === "number" || typeof reference === "string") return null;

  const email = reference.email;

  return typeof email === "string" && email.trim() !== "" ? email.trim().toLowerCase() : null;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/u;

/**
 * Pipedrive timestamps are UTC but are serialized without a zone designator
 * ("2024-03-05 11:22:33"), which `new Date(...)` reads as local time. Parse the
 * parts explicitly so an import run is not shifted by the operator's timezone.
 */
export function parsePipedriveDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly) return new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])));

  const dateTime = DATE_TIME.exec(trimmed);
  if (!dateTime) return null;

  return new Date(
    Date.UTC(
      Number(dateTime[1]),
      Number(dateTime[2]) - 1,
      Number(dateTime[3]),
      Number(dateTime[4]),
      Number(dateTime[5]),
      Number(dateTime[6] ?? "0"),
    ),
  );
}

/** Pipedrive money arrives as a number or a numeric string; `null` means "no value". */
export function parsePipedriveNumber(value: unknown): number | null {
  return numeric(value);
}

/** Normalizes the four documented deal statuses; anything else is treated as deleted. */
export function parseDealStatus(value: unknown): PipedriveDealStatus {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (raw === "open" || raw === "won" || raw === "lost") return raw;

  return "deleted";
}

/** Reads `email`/`phone`, which Pipedrive returns as a labelled array or a bare string. */
export function contactPointValues(input: PipedriveContactPoint[] | string | null | undefined): string[] {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed === "" ? [] : [trimmed];
  }

  if (!Array.isArray(input)) return [];

  const values = input.flatMap((entry) => {
    const value = typeof entry.value === "string" ? entry.value.trim() : "";
    return value === "" ? [] : [value];
  });

  return [...new Set(values)];
}
