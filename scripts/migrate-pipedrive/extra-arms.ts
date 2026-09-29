/**
 * PRD 10 W4-07: the arms the first migration left out.
 *
 * - lists: a Pipedrive person field of type enum or set (the client's "CDI Target") becomes one
 *   contact list per option, holding every migrated person that carries the option.
 * - files: Pipedrive files attached to a deal, lead, person or organization are uploaded onto
 *   the migrated record through the presigned record-file flow.
 *
 * Both are idempotent: lists are found by name and adding a member twice changes nothing; a file
 * whose name and size already exist on the record is skipped.
 */

import type { CrmWrites } from "./crm-writes";
import type { PipedriveFile, PipedrivePerson, PipedrivePersonField } from "./pipedrive.types";
import type { PipedriveSource } from "./pipedrive-source";
import type { MigrationLedger } from "./reconciliation";

export type ListArmReads = {
  contactLists(): Promise<Array<{ id: string; name: string }>>;
};

export type FileArmReads = {
  recordFiles(entityType: string, recordId: string): Promise<Array<{ fileName: string; byteSize: number }>>;
};

const LIST_FIELD_TYPES = new Set(["enum", "set"]);

/** `<field>: <option>`, so two fields with an option of the same label stay apart. */
export function listNameFor(field: PipedrivePersonField, optionLabel: string): string {
  return `${String(field.name ?? field.key ?? "").trim()}: ${optionLabel.trim()}`;
}

/** Reads the option ids a person carries in an enum (one id) or set (comma-separated ids) field. */
export function optionIdsOf(person: PipedrivePerson, field: PipedrivePersonField): string[] {
  const key = field.key;
  if (!key) return [];

  const raw = person[key];
  if (raw === null || raw === undefined || raw === "") return [];
  if (Array.isArray(raw)) return raw.map(String);

  return String(raw)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function migrateLists(args: {
  fieldNames: readonly string[];
  source: PipedriveSource;
  client: ListArmReads;
  writes: CrmWrites;
  ledger: MigrationLedger;
  contactIdByPipedriveId: ReadonlyMap<number, string>;
  log: (message: string) => void;
}): Promise<void> {
  const tally = args.ledger.tally("lists");
  if (args.fieldNames.length === 0) {
    args.log("No --list-fields given; skipping lists.");
    return;
  }

  const wanted = new Set(args.fieldNames.map((name) => name.trim().toLowerCase()));
  const fields = (await args.source.personFields()).filter(
    (field) => wanted.has(String(field.name ?? "").trim().toLowerCase()) || wanted.has(String(field.key ?? "").toLowerCase()),
  );
  for (const name of args.fieldNames)
    if (!fields.some((field) => [field.name, field.key].some((value) => String(value ?? "").toLowerCase() === name.trim().toLowerCase())))
      args.ledger.unmapped("list.field", name, "no person field with this name or key");

  const persons = await args.source.persons();
  const existing = new Map((await args.client.contactLists()).map((list) => [list.name, list.id]));

  for (const field of fields) {
    if (!LIST_FIELD_TYPES.has(String(field.field_type ?? ""))) {
      args.ledger.unmapped("list.field", String(field.name ?? field.key), `field type ${field.field_type} has no options`);
      continue;
    }

    for (const option of field.options ?? []) {
      const optionId = String(option.id ?? "");
      const name = listNameFor(field, String(option.label ?? optionId));
      tally.sourceCount += 1;

      const members = persons.flatMap((person) =>
        optionIdsOf(person, field).includes(optionId) ? [args.contactIdByPipedriveId.get(person.id)] : [],
      );
      const contactIds = members.filter((id): id is string => typeof id === "string");
      const missing = members.length - contactIds.length;
      if (missing > 0)
        args.ledger.unmapped("list.member", name, `${missing} person(s) with this option were not migrated`);

      try {
        let listId = existing.get(name);
        if (!listId) {
          listId = (await args.writes.createContactList(name)).id;
          existing.set(name, listId);
          tally.created += 1;
        }
        await args.writes.addContactListMembers(listId, contactIds);
        tally.targetCount += 1;
      } catch (error) {
        args.ledger.skip({
          entity: "lists",
          sourceId: `${field.key}:${optionId}`,
          label: name,
          reason: error instanceof Error ? error.message : "unexpected failure",
        });
      }
    }
  }
}

type FileTarget = { entityType: "deal" | "lead" | "contact" | "organization"; recordId: string };

type FileIndexes = {
  dealIdByPipedriveId: ReadonlyMap<number, string>;
  leadIdByPipedriveId: ReadonlyMap<string, string>;
  contactIdByPipedriveId: ReadonlyMap<number, string>;
  organizationIdByPipedriveId: ReadonlyMap<number, string>;
};

function targetOf(file: PipedriveFile, indexes: FileIndexes): FileTarget | null {
  const deal = typeof file.deal_id === "number" ? indexes.dealIdByPipedriveId.get(file.deal_id) : undefined;
  if (deal) return { entityType: "deal", recordId: deal };

  const lead = file.lead_id ? indexes.leadIdByPipedriveId.get(file.lead_id) : undefined;
  if (lead) return { entityType: "lead", recordId: lead };

  const person = typeof file.person_id === "number" ? indexes.contactIdByPipedriveId.get(file.person_id) : undefined;
  if (person) return { entityType: "contact", recordId: person };

  const organization =
    typeof file.org_id === "number" ? indexes.organizationIdByPipedriveId.get(file.org_id) : undefined;
  if (organization) return { entityType: "organization", recordId: organization };

  return null;
}

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};

export function contentTypeFor(fileName: string, declared?: string | null): string {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  return CONTENT_TYPES[extension] ?? (declared && declared.includes("/") ? declared : "application/octet-stream");
}

export async function migrateFiles(args: {
  source: PipedriveSource;
  client: FileArmReads;
  writes: CrmWrites;
  ledger: MigrationLedger;
  limit: number | null;
  indexes: FileIndexes;
}): Promise<void> {
  const tally = args.ledger.tally("files");
  const all = (await args.source.files()).filter((file) => file.active_flag !== false);
  const files = args.limit === null ? all : all.slice(0, args.limit);
  tally.sourceCount = files.length;
  const existingByRecord = new Map<string, Array<{ fileName: string; byteSize: number }>>();

  for (const file of files) {
    const fileName = String(file.file_name ?? file.name ?? `pipedrive-file-${file.id}`);
    const skip = (reason: string) =>
      args.ledger.skip({ entity: "files", sourceId: String(file.id), label: fileName, reason });

    const target = targetOf(file, args.indexes);
    if (!target) {
      skip("its deal, lead, person or organization was not migrated");
      continue;
    }

    const key = `${target.entityType}:${target.recordId}`;
    if (!existingByRecord.has(key))
      existingByRecord.set(key, args.writes.dryRun ? [] : await args.client.recordFiles(target.entityType, target.recordId));
    const already = existingByRecord.get(key) ?? [];
    if (already.some((existing) => existing.fileName === fileName && existing.byteSize === file.file_size)) {
      tally.unchanged += 1;
      tally.targetCount += 1;
      continue;
    }

    const bytes = await args.source.fileContent(file);
    if (!bytes) {
      skip("the export carries no content for this file");
      continue;
    }

    try {
      await args.writes.uploadRecordFile({
        ...target,
        fileName,
        contentType: contentTypeFor(fileName, file.file_type),
        bytes,
      });
      already.push({ fileName, byteSize: bytes.byteLength });
      tally.created += 1;
      tally.targetCount += 1;
    } catch (error) {
      skip(error instanceof Error ? error.message : "unexpected failure");
    }
  }
}
