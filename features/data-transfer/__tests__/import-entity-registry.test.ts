import { describe, expect, it } from "vitest";

import { IMPORT_ENTITIES } from "../import/import-entity.registry";

const RESOLVED_BY_RELATION_INDEX = new Set(["relationIds", "dealServices"]);

describe("import entity registry", () => {
  it("declares a relation target on every field the plan resolves through the relation index", () => {
    const missing = Object.values(IMPORT_ENTITIES).flatMap((descriptor) =>
      descriptor.fields
        .filter((field) => RESOLVED_BY_RELATION_INDEX.has(field.kind) && !field.relationTarget)
        .map((field) => `${descriptor.entityType}.${field.key}`),
    );

    expect(missing).toEqual([]);
  });

  it("declares a catalog target on every singular relation, which has no relation index to fall back on", () => {
    const missing = Object.values(IMPORT_ENTITIES).flatMap((descriptor) =>
      descriptor.fields
        .filter((field) => field.kind === "relationId" && !field.catalogTarget)
        .map((field) => `${descriptor.entityType}.${field.key}`),
    );

    expect(missing).toEqual([]);
  });

  it("places a deal in its pipeline through single ids, not the array a relation list would send", () => {
    const byKey = new Map(IMPORT_ENTITIES.deal.fields.map((field) => [field.key, field]));

    expect(byKey.get("pipelineId")).toMatchObject({ kind: "relationId", catalogTarget: "pipeline" });
    expect(byKey.get("stageId")).toMatchObject({ kind: "relationId", catalogTarget: "stage" });
    expect(byKey.get("expectedCloseDate")?.kind).toBe("date");
    expect(byKey.get("probability")?.kind).toBe("number");
  });

  it("keeps deal services resolvable, which is what a deals round trip depends on", () => {
    const services = IMPORT_ENTITIES.deal.fields.find((field) => field.key === "services");

    expect(services?.kind).toBe("dealServices");
    expect(services?.relationTarget).toBe("service");
  });
});
