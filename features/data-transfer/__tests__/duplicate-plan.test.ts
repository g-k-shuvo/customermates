import type { DuplicateKeyColumn } from "../import/duplicate-plan";
import type { ImportPlan, PlanRow } from "../import/import-plan";

import { describe, expect, it } from "vitest";

import { EntityType } from "@/generated/prisma";

import {
  applyDuplicateStrategy,
  duplicateKeyColumns,
  duplicateKeysBySheetRow,
  importKeyColumnFor,
} from "../import/duplicate-plan";

const COLUMN: DuplicateKeyColumn = { index: 0, letter: "A", header: "E-Mail", key: { kind: "field", key: "name" } };

function planRow(sheetRow: number, payload: Record<string, unknown> = {}): PlanRow {
  return { sourceIndex: sheetRow - 2, sheetRow, recordId: null, payload: { name: `Row ${sheetRow}`, ...payload } };
}

function plan(create: PlanRow[]): ImportPlan {
  return { create, update: [], issues: [] };
}

describe("importKeyColumnFor", () => {
  it("accepts the standard fields that identify a record and refuses the rest", () => {
    expect(importKeyColumnFor({ kind: "field", key: "name" }, EntityType.deal)).toEqual({ kind: "field", key: "name" });
    expect(importKeyColumnFor({ kind: "field", key: "notes" }, EntityType.deal)).toBeNull();
    expect(importKeyColumnFor({ kind: "field", key: "firstName" }, EntityType.contact)).toEqual({
      kind: "field",
      key: "firstName",
    });
    expect(importKeyColumnFor({ kind: "field", key: "firstName" }, EntityType.deal)).toBeNull();
  });

  it("accepts a contact channel but not a channel on an entity that has none", () => {
    expect(importKeyColumnFor({ kind: "identifier", provider: "mail" }, EntityType.contact)).toEqual({
      kind: "identifier",
      provider: "mail",
    });
    expect(importKeyColumnFor({ kind: "identifier", provider: "mail" }, EntityType.deal)).toBeNull();
    expect(importKeyColumnFor({ kind: "identifier", provider: "carrier-pigeon" }, EntityType.contact)).toBeNull();
  });

  it("accepts any custom column and never the record id or an ignored column", () => {
    expect(importKeyColumnFor({ kind: "customField", columnId: "c1" }, EntityType.task)).toEqual({
      kind: "customField",
      columnId: "c1",
    });
    expect(importKeyColumnFor({ kind: "recordId" }, EntityType.task)).toBeNull();
    expect(importKeyColumnFor({ kind: "ignore" }, EntityType.task)).toBeNull();
  });
});

describe("duplicateKeyColumns", () => {
  it("offers only the mapped columns that can identify an existing record", () => {
    const columns = duplicateKeyColumns({
      sources: [
        { index: 0, letter: "A", header: "Name", samples: [] },
        { index: 1, letter: "B", header: "Notizen", samples: [] },
        { index: 2, letter: "C", header: "E-Mail", samples: [] },
      ],
      mapping: [{ kind: "field", key: "name" }, { kind: "field", key: "notes" }, { kind: "ignore" }],
      entityType: EntityType.deal,
    });

    expect(columns).toEqual([{ index: 0, letter: "A", header: "Name", key: { kind: "field", key: "name" } }]);
  });
});

describe("duplicateKeysBySheetRow", () => {
  it("reads the nominated column and leaves a blank cell without a key", () => {
    const keys = duplicateKeysBySheetRow(
      [
        { sourceIndex: 0, sheetRow: 2, cells: ["  Ada  ", "x"] },
        { sourceIndex: 1, sheetRow: 3, cells: ["", "y"] },
      ],
      0,
    );

    expect([...keys.entries()]).toEqual([[2, "Ada"]]);
  });
});

describe("applyDuplicateStrategy", () => {
  const keysBySheetRow = new Map([
    [2, "ada@example.com"],
    [3, "grace@example.com"],
  ]);

  it("leaves the plan exactly as it was under the default strategy", () => {
    const original = plan([planRow(2), planRow(3)]);

    expect(
      applyDuplicateStrategy({
        plan: original,
        strategy: "create",
        column: COLUMN,
        keysBySheetRow,
        matches: new Map([["ada@example.com", ["contact-1"]]]),
      }),
    ).toBe(original);
  });

  it("turns a matched row into an update carrying the id of the record it found", () => {
    const result = applyDuplicateStrategy({
      plan: plan([planRow(2), planRow(3)]),
      strategy: "update",
      column: COLUMN,
      keysBySheetRow,
      matches: new Map([["ada@example.com", ["contact-1"]]]),
    });

    expect(result.create.map((row) => row.sheetRow)).toEqual([3]);
    expect(result.update).toEqual([
      { sourceIndex: 0, sheetRow: 2, recordId: "contact-1", payload: { name: "Row 2", id: "contact-1" } },
    ]);
    expect(result.issues).toEqual([]);
  });

  it("never lets a blank placeholder overwrite what the record already holds", () => {
    const result = applyDuplicateStrategy({
      plan: plan([planRow(2, { lastName: "" })]),
      strategy: "update",
      column: COLUMN,
      keysBySheetRow,
      matches: new Map([["ada@example.com", ["contact-1"]]]),
    });

    expect(result.update[0].payload).toEqual({ name: "Row 2", id: "contact-1" });
  });

  it("drops channels from a converted row and says so, like every other update", () => {
    const result = applyDuplicateStrategy({
      plan: plan([planRow(2, { identifiers: [{ provider: "mail", value: "ada@example.com" }] })]),
      strategy: "update",
      column: COLUMN,
      keysBySheetRow,
      matches: new Map([["ada@example.com", ["contact-1"]]]),
    });

    expect(result.update[0].payload.identifiers).toBeUndefined();
    expect(result.issues.map((issue) => issue.code)).toEqual(["channelsNotUpdated"]);
    expect(result.issues[0].blocking).toBe(false);
  });

  it("skips a matched row and reports it, so the count is not a silent loss", () => {
    const result = applyDuplicateStrategy({
      plan: plan([planRow(2), planRow(3)]),
      strategy: "skip",
      column: COLUMN,
      keysBySheetRow,
      matches: new Map([["ada@example.com", ["contact-1"]]]),
    });

    expect(result.create.map((row) => row.sheetRow)).toEqual([3]);
    expect(result.update).toEqual([]);
    expect(result.issues).toEqual([
      {
        sheetRow: 2,
        sourceIndex: 0,
        columnLetter: "A",
        columnLabel: "E-Mail",
        values: { value: "ada@example.com" },
        code: "duplicateSkipped",
        blocking: false,
      },
    ]);
  });

  it("blocks a key that hits two records instead of quietly updating the first", () => {
    const result = applyDuplicateStrategy({
      plan: plan([planRow(2)]),
      strategy: "update",
      column: COLUMN,
      keysBySheetRow,
      matches: new Map([["ada@example.com", ["contact-1", "contact-2"]]]),
    });

    expect(result.create).toEqual([]);
    expect(result.update).toEqual([]);
    expect(result.issues[0]).toMatchObject({ code: "duplicateKeyAmbiguous", blocking: true, sheetRow: 2 });
  });

  it("keeps a row whose key is blank or unmatched as a plain create", () => {
    const result = applyDuplicateStrategy({
      plan: plan([planRow(2), planRow(4)]),
      strategy: "update",
      column: COLUMN,
      keysBySheetRow,
      matches: new Map(),
    });

    expect(result.create.map((row) => row.sheetRow)).toEqual([2, 4]);
    expect(result.issues).toEqual([]);
  });

  it("never touches a row that already names a record through the id column", () => {
    const existing: PlanRow = { sourceIndex: 9, sheetRow: 11, recordId: "deal-7", payload: { id: "deal-7" } };
    const result = applyDuplicateStrategy({
      plan: { create: [], update: [existing], issues: [] },
      strategy: "skip",
      column: COLUMN,
      keysBySheetRow,
      matches: new Map([["ada@example.com", ["contact-1"]]]),
    });

    expect(result.update).toEqual([existing]);
  });
});
