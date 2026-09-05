import { describe, expect, it } from "vitest";

import { EntityType } from "@/generated/prisma";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { IMPORT_KEY_MATCH_BATCH, MatchImportKeysSchema } from "../data-transfer.schema";

function parse(entityType: EntityType, key: unknown, values: string[] = ["a"]) {
  return MatchImportKeysSchema.safeParse({ entityType, key, values });
}

describe("MatchImportKeysSchema", () => {
  it("accepts a standard field the entity actually identifies records by", () => {
    expect(parse(EntityType.deal, { kind: "field", key: "name" }).success).toBe(true);
    expect(parse(EntityType.contact, { kind: "field", key: "lastName" }).success).toBe(true);
  });

  it("refuses a field that is not a key on that entity, so no column name reaches Prisma", () => {
    const result = parse(EntityType.deal, { kind: "field", key: "notes" });

    expect(result.success).toBe(false);
    const issue = result.error?.issues[0] as { params?: Record<string, unknown> } | undefined;
    expect(issue?.params?.error).toBe(CustomErrorCode.importKeyUnsupported);
    expect(parse(EntityType.deal, { kind: "field", key: "firstName" }).success).toBe(false);
    expect(parse(EntityType.task, { kind: "field", key: "id" }).success).toBe(false);
  });

  it("refuses a channel key on an entity that has no channels", () => {
    expect(parse(EntityType.contact, { kind: "identifier", provider: "mail" }).success).toBe(true);
    expect(parse(EntityType.deal, { kind: "identifier", provider: "mail" }).success).toBe(false);
    expect(parse(EntityType.contact, { kind: "identifier", provider: "carrier-pigeon" }).success).toBe(false);
  });

  it("takes any custom column but only as a real column id", () => {
    expect(
      parse(EntityType.task, { kind: "customField", columnId: "16000000-0000-4000-8000-000000000001" }).success,
    ).toBe(true);
    expect(parse(EntityType.task, { kind: "customField", columnId: "Amount" }).success).toBe(false);
  });

  it("keeps one request to a batch the browser can chunk to", () => {
    const key = { kind: "field", key: "name" };

    expect(parse(EntityType.deal, key, []).success).toBe(false);
    expect(
      parse(
        EntityType.deal,
        key,
        Array.from({ length: IMPORT_KEY_MATCH_BATCH }, () => "x"),
      ).success,
    ).toBe(true);
    expect(
      parse(
        EntityType.deal,
        key,
        Array.from({ length: IMPORT_KEY_MATCH_BATCH + 1 }, () => "x"),
      ).success,
    ).toBe(false);
  });
});
