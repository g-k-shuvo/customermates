import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { describe, expect, it } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

import { webFormCustomFieldValues } from "../ingest/web-form-custom-fields";

const id = (n: number) => `${String(n).repeat(8)}-0000-4000-8000-000000000000`;

function column(n: number, entityType: EntityType, type: CustomColumnType, options?: unknown): CustomColumnDto {
  return { id: id(n), label: `Column ${n}`, entityType, type, options: options ?? {} } as unknown as CustomColumnDto;
}

const CONSENT = column(1, EntityType.lead, CustomColumnType.singleSelect, {
  options: [
    { value: "opt-yes", label: "Yes", color: "success", isDefault: false, index: 0 },
    { value: "opt-no", label: "No", color: "secondary", isDefault: false, index: 1 },
  ],
});
const PHONE = column(2, EntityType.contact, CustomColumnType.phone);
const UTM = column(3, EntityType.lead, CustomColumnType.plain);
const EMAIL = column(4, EntityType.contact, CustomColumnType.email);
const BUDGET = column(5, EntityType.lead, CustomColumnType.currency);
const START = column(6, EntityType.lead, CustomColumnType.date);
const ORG_TYPE = column(7, EntityType.organization, CustomColumnType.plain);
const COLUMNS = [CONSENT, PHONE, UTM, EMAIL, BUDGET, START, ORG_TYPE];

const values = (mapped: { columnId: string; raw: string }[]) => webFormCustomFieldValues(mapped, COLUMNS);

describe("webFormCustomFieldValues", () => {
  it("routes lead and contact columns, matching a select option by its label", () => {
    expect(
      values([
        { columnId: CONSENT.id, raw: "yes" },
        { columnId: UTM.id, raw: "linkedin" },
        { columnId: PHONE.id, raw: "+49 (30) 123-4567" },
      ]),
    ).toEqual({
      lead: [
        { columnId: CONSENT.id, value: "opt-yes" },
        { columnId: UTM.id, value: "linkedin" },
      ],
      contact: [{ columnId: PHONE.id, value: "+49301234567" }],
    });
  });

  it("turns a 00 prefix into + and skips a phone number with no country code", () => {
    expect(values([{ columnId: PHONE.id, raw: "0049 30 1234567" }]).contact).toEqual([
      { columnId: PHONE.id, value: "+49301234567" },
    ]);
    expect(values([{ columnId: PHONE.id, raw: "030 1234567" }]).contact).toEqual([]);
  });

  it("normalises amounts and dates, and skips values their field would refuse", () => {
    expect(
      values([
        { columnId: BUDGET.id, raw: "€ 12,500" },
        { columnId: START.id, raw: "30.11.2026" },
        { columnId: EMAIL.id, raw: "not an address" },
        { columnId: CONSENT.id, raw: "maybe" },
      ]),
    ).toEqual({
      lead: [
        { columnId: BUDGET.id, value: "12500" },
        { columnId: START.id, value: "2026-11-30" },
      ],
      contact: [],
    });
  });

  it("ignores unknown columns and columns of other record types, and keeps the last value for a column", () => {
    expect(
      values([
        { columnId: id(9), raw: "orphan" },
        { columnId: ORG_TYPE.id, raw: "Enterprise" },
        { columnId: UTM.id, raw: "first" },
        { columnId: UTM.id, raw: "second" },
      ]),
    ).toEqual({ lead: [{ columnId: UTM.id, value: "second" }], contact: [] });
  });
});
