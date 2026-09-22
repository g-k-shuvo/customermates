/**
 * Replays historical Fluent Forms entries through the CRM web form endpoint.
 *
 * Idempotency rests on `external_id`: the endpoint answers 200 `duplicate` for a
 * submission it already holds, so this can be run repeatedly while a mapping is
 * being tuned. Run it with --dry-run first and reconcile the per-form counts it
 * prints against the entry counts in wp-admin.
 *
 * Usage:
 *   WP_BASE_URL=https://site.example WP_USER=editor WP_APP_PASSWORD='xxxx yyyy' \
 *   CRM_BASE_URL=https://crm.example CRM_SIGNING_SECRET=... \
 *   npx tsx scripts/backfill-fluent-forms.ts --map 3=footer-callback --map 7=contact --dry-run
 */

import { hmacSha256Hex } from "@/core/utils/hmac";

const PAGE_SIZE = 50;

const OUTCOME_DELIVERED = new Set([200, 202]);

type Args = {
  map: Map<number, string>;
  dryRun: boolean;
  limit: number | null;
};

type FluentFormsEntry = {
  id: number;
  form_id: number;
  created_at?: string;
  response?: Record<string, unknown>;
  user_inputs?: Record<string, unknown>;
};

type FormOutcome = {
  slug: string;
  seen: number;
  delivered: number;
  duplicate: number;
  failed: number;
  firstError: string | null;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set`);

  return value;
}

function parseArgs(argv: string[]): Args {
  const map = new Map<number, string>();
  let dryRun = false;
  let limit: number | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--limit") limit = Number(argv[(index += 1)]);
    else if (arg === "--map") {
      const [formId, slug] = (argv[(index += 1)] ?? "").split("=", 2);
      if (!/^\d+$/.test(formId ?? "") || !slug) throw new Error(`--map expects <formId>=<slug>, got "${argv[index]}"`);
      map.set(Number(formId), slug);
    }
  }

  if (map.size === 0) throw new Error("at least one --map <formId>=<slug> is required");
  if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) throw new Error("--limit expects a positive number");

  return { map, dryRun, limit };
}

async function fetchEntries(page: number, formId: number): Promise<FluentFormsEntry[]> {
  const base = required("WP_BASE_URL").replace(/\/$/, "");
  const auth = Buffer.from(`${required("WP_USER")}:${required("WP_APP_PASSWORD")}`).toString("base64");

  const url = new URL(`${base}/wp-json/fluentform/v1/submissions`);
  url.searchParams.set("form_id", String(formId));
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(PAGE_SIZE));

  const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });

  if (!response.ok) throw new Error(`Fluent Forms responded ${response.status} for form ${formId} page ${page}`);

  const body = (await response.json()) as { data?: FluentFormsEntry[] } | FluentFormsEntry[];

  return Array.isArray(body) ? body : (body.data ?? []);
}

async function deliver(slug: string, entry: FluentFormsEntry): Promise<{ code: number; body: string }> {
  const crmBase = required("CRM_BASE_URL").replace(/\/$/, "");
  const secret = required("CRM_SIGNING_SECRET");

  const payload = JSON.stringify({
    external_id: String(entry.id),
    form_id: entry.form_id,
    form_title: "",
    submitted_at: entry.created_at ?? new Date().toISOString(),
    page_url: "",
    fields: entry.response ?? entry.user_inputs ?? {},
  });

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = hmacSha256Hex(secret, `${timestamp}.${payload}`);

  const response = await fetch(`${crmBase}/api/webforms/${encodeURIComponent(slug)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webform-signature": `t=${timestamp},v0=${signature}`,
    },
    body: payload,
  });

  return { code: response.status, body: (await response.text()).slice(0, 200) };
}

async function backfillForm(formId: number, slug: string, args: Args): Promise<FormOutcome> {
  const outcome: FormOutcome = { slug, seen: 0, delivered: 0, duplicate: 0, failed: 0, firstError: null };

  for (let page = 1; ; page += 1) {
    const entries = await fetchEntries(page, formId);
    if (entries.length === 0) break;

    for (const entry of entries) {
      if (args.limit !== null && outcome.seen >= args.limit) return outcome;

      outcome.seen += 1;

      if (args.dryRun) continue;

      const { code, body } = await deliver(slug, entry);

      if (code === 200) outcome.duplicate += 1;
      else if (OUTCOME_DELIVERED.has(code)) outcome.delivered += 1;
      else {
        outcome.failed += 1;
        outcome.firstError ??= `entry ${entry.id}: ${code} ${body}`;
      }
    }

    if (entries.length < PAGE_SIZE) break;
  }

  return outcome;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rows: string[] = [];
  let failed = 0;

  for (const [formId, slug] of args.map) {
    const outcome = await backfillForm(formId, slug, args);
    failed += outcome.failed;

    rows.push(
      `form ${formId} -> ${slug}: seen ${outcome.seen}, delivered ${outcome.delivered}, ` +
        `duplicate ${outcome.duplicate}, failed ${outcome.failed}` +
        (outcome.firstError ? `\n    first error: ${outcome.firstError}` : ""),
    );
  }

  process.stdout.write(`${args.dryRun ? "dry run — nothing was sent\n" : ""}${rows.join("\n")}\n`);

  if (failed > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
