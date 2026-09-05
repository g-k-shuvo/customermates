import { beforeEach, describe, expect, it, vi } from "vitest";

import { EntityType } from "@/generated/prisma";

const db = vi.hoisted(() => ({
  prisma: {
    contact: { findMany: vi.fn() },
    organization: { findMany: vi.fn() },
    deal: { findMany: vi.fn() },
    service: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
    contactIdentifier: { findMany: vi.fn() },
    customFieldValue: { findMany: vi.fn() },
  },
}));

vi.mock("@/prisma/db", () => db);

const tenant = vi.hoisted(() => ({
  getTenantUser: () => ({ id: "user-1", companyId: "company-1", role: { isSystemRole: true, permissions: [] } }),
  isTenantGuardBypassed: () => false,
}));

vi.mock("@/core/decorators/tenant-context", () => tenant);

import { ImportKeyMatcher } from "../import-key-matcher.service";

describe("ImportKeyMatcher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("matches a name case-insensitively and answers with the spelling the browser sent", async () => {
    db.prisma.organization.findMany.mockResolvedValue([{ id: "org-1", name: "ACME GmbH" }]);

    const matches = await new ImportKeyMatcher().match(EntityType.organization, { kind: "field", key: "name" }, [
      "acme gmbh",
    ]);

    expect(matches).toEqual([["acme gmbh", ["org-1"]]]);
    expect(db.prisma.organization.findMany.mock.calls[0][0].where).toEqual({
      companyId: "company-1",
      name: { in: ["acme gmbh"], mode: "insensitive" },
    });
  });

  it("returns every id a value hits, so an ambiguous key can block instead of updating the first match", async () => {
    db.prisma.deal.findMany.mockResolvedValue([
      { id: "deal-1", name: "Renewal" },
      { id: "deal-2", name: "renewal" },
    ]);

    const matches = await new ImportKeyMatcher().match(EntityType.deal, { kind: "field", key: "name" }, ["Renewal"]);

    expect(matches).toEqual([["Renewal", ["deal-1", "deal-2"]]]);
  });

  it("leaves a value with no record out of the answer entirely", async () => {
    db.prisma.deal.findMany.mockResolvedValue([]);

    const matches = await new ImportKeyMatcher().match(EntityType.deal, { kind: "field", key: "name" }, ["Nothing"]);

    expect(matches).toEqual([]);
  });

  it("normalises a channel value before the lookup, so a formatted phone number still finds its contact", async () => {
    db.prisma.contactIdentifier.findMany.mockResolvedValue([{ value: "+4915150799175", contactId: "contact-1" }]);

    const matches = await new ImportKeyMatcher().match(
      EntityType.contact,
      { kind: "identifier", provider: "whatsapp" },
      ["+49 151 5079 9175"],
    );

    expect(matches).toEqual([["+49 151 5079 9175", ["contact-1"]]]);

    const where = db.prisma.contactIdentifier.findMany.mock.calls[0][0].where;
    expect(where.value).toEqual({ in: ["+4915150799175"] });
    expect(where.channelClass).toBe("phone");
    expect(where.contact).toEqual({ companyId: "company-1" });
  });

  it("never queries for a channel value that cannot be normalised", async () => {
    const matches = await new ImportKeyMatcher().match(EntityType.contact, { kind: "identifier", provider: "mail" }, [
      "not-an-email",
    ]);

    expect(matches).toEqual([]);
    expect(db.prisma.contactIdentifier.findMany).not.toHaveBeenCalled();
  });

  it("reads a custom column through the owning record, so an unreadable record cannot be matched", async () => {
    db.prisma.customFieldValue.findMany.mockResolvedValue([{ value: "A-17", contactId: "contact-9" }]);

    const matches = await new ImportKeyMatcher().match(
      EntityType.contact,
      { kind: "customField", columnId: "16000000-0000-4000-8000-000000000001" },
      ["a-17"],
    );

    expect(matches).toEqual([["a-17", ["contact-9"]]]);
    expect(db.prisma.customFieldValue.findMany.mock.calls[0][0].where).toEqual({
      companyId: "company-1",
      entityType: EntityType.contact,
      columnId: "16000000-0000-4000-8000-000000000001",
      value: { in: ["a-17"], mode: "insensitive" },
      contact: { companyId: "company-1" },
    });
  });
});
