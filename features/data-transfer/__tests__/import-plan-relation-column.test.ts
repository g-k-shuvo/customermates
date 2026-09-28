import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { describe, expect, it } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

import { IMPORT_ENTITIES } from "../import/import-entity.registry";
import { buildPlan } from "../import/import-plan";

const COLUMN = "cccc0000-0000-4000-8000-000000000001";
const ACME = "70000000-0000-4000-8000-000000000001";
const GLOBEX_ONE = "70000000-0000-4000-8000-000000000002";
const GLOBEX_TWO = "70000000-0000-4000-8000-000000000003";

const accountColumn: CustomColumnDto = {
  id: COLUMN,
  label: "Opportunity company",
  entityType: EntityType.deal,
  type: CustomColumnType.relation,
  options: { targetEntityType: EntityType.organization },
};

function planFor(value: string) {
  return buildPlan({
    rows: [{ sourceIndex: 0, sheetRow: 2, cells: [value] }],
    sources: [{ index: 0, letter: "A", header: "Opportunity company", samples: [] }],
    mapping: [{ kind: "customField", columnId: COLUMN }],
    descriptor: IMPORT_ENTITIES[EntityType.deal],
    customColumns: [accountColumn],
    relationIndex: {
      organization: new Map([
        ["acme gmbh", [ACME]],
        ["globex", [GLOBEX_ONE, GLOBEX_TWO]],
      ]),
    },
  });
}

describe("importing a relation custom column", () => {
  it("resolves the linked record by its name, ignoring case", () => {
    expect(planFor("ACME GmbH").create[0].payload.customFieldValues).toEqual([{ columnId: COLUMN, value: ACME }]);
  });

  it("passes a record id through for the server to validate", () => {
    expect(planFor(GLOBEX_ONE).create[0].payload.customFieldValues).toEqual([{ columnId: COLUMN, value: GLOBEX_ONE }]);
  });

  it("blocks the row when the name is unknown or matches several records", () => {
    expect(planFor("Initech").issues.map(({ code, blocking }) => ({ code, blocking }))).toEqual([
      { code: "relationNotFound", blocking: true },
    ]);
    expect(planFor("Globex").issues.map(({ code, blocking }) => ({ code, blocking }))).toEqual([
      { code: "relationAmbiguous", blocking: true },
    ]);
  });
});
