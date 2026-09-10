import type { Filter, GetQueryParams } from "@/core/base/base-get.schema";

import { describe, it, expect, beforeEach, vi } from "vitest";

const fake = vi.hoisted(() => {
  const ids = {
    company: "test-company-id",
    user: "test-user-id",
    deal: "00000000-0000-4000-8000-000000000001",
    lostReason: "00000000-0000-4000-8000-000000000080",
  };

  const deal = {
    id: ids.deal,
    name: "Acme renewal",
    totalValue: 0,
    totalQuantity: 0,
    weightedValue: null,
    notes: null,
    companyId: ids.company,
    pipelineId: null,
    stageId: null,
    status: "lost",
    expectedCloseDate: null,
    probability: null,
    stageEnteredAt: null,
    rottingAt: null,
    lostReasonId: ids.lostReason,
    lostReason: { name: "Price" },
    lostNotes: null,
    wonAt: null,
    lostAt: new Date("2026-09-02T00:00:00.000Z"),
    closedAt: new Date("2026-09-02T00:00:00.000Z"),
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    organizations: [],
    users: [],
    contacts: [],
    services: [],
    tasks: [],
    customFieldValues: [],
  };

  const client = {
    deal: {
      findFirst: () => Promise.resolve({ ...deal }),
      findMany: () => Promise.resolve([{ ...deal }]),
    },
  };

  return { ids, deal, client, prisma: { ...client, $transaction: (fn: any) => fn(client) } };
});

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), setUser: vi.fn(), setTag: vi.fn() }));
vi.mock("@/prisma/db", () => ({ prisma: fake.prisma }));
vi.mock("@/core/di", () => ({
  getCustomColumnRepo: () => ({
    findByEntityType: () => Promise.resolve([]),
    getFilterableCustomFields: () => Promise.resolve([]),
  }),
  getPipelineRepo: () => ({}),
}));

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { Action, Resource } from "@/generated/prisma";
import { PrismaDealRepo } from "../prisma-deal.repository";

const user = createMockUser({ companyId: fake.ids.company, id: fake.ids.user });

const SCHEDULED_TASK = { completedAt: null, dueAt: { not: null } };

function nextActivityFilter(operator: FilterOperatorKey, value: string[]): Filter {
  return { field: FilterFieldKey.nextActivity, operator, value } as Filter;
}

function queryArgs(params: GetQueryParams) {
  return runWithTenant(user, () => new PrismaDealRepo().buildQueryArgs(params));
}

function andClauses(where: Record<string, unknown>): unknown[] {
  const and = where.AND;

  return Array.isArray(and) ? and : [];
}

describe("next activity deal filter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps only deals with nothing scheduled when the operator selects false", async () => {
    const { where } = await queryArgs({
      filters: [nextActivityFilter(FilterOperatorKey.in, ["false"])],
    });

    expect(andClauses(where)).toEqual([
      { tasks: { none: { task: { companyId: fake.ids.company, ...SCHEDULED_TASK } } } },
    ]);
  });

  it("keeps only deals that do have something scheduled when the operator selects true", async () => {
    const { where } = await queryArgs({
      filters: [nextActivityFilter(FilterOperatorKey.in, ["true"])],
    });

    expect(andClauses(where)).toEqual([
      { tasks: { some: { task: { companyId: fake.ids.company, ...SCHEDULED_TASK } } } },
    ]);
  });

  it("reads notIn as the complement of in", async () => {
    const { where } = await queryArgs({
      filters: [nextActivityFilter(FilterOperatorKey.notIn, ["false"])],
    });

    expect(andClauses(where)).toEqual([
      { tasks: { some: { task: { companyId: fake.ids.company, ...SCHEDULED_TASK } } } },
    ]);
  });

  it("counts an overdue activity as scheduled, so it never constrains the due instant against now", async () => {
    const { where } = await queryArgs({
      filters: [nextActivityFilter(FilterOperatorKey.in, ["false"])],
    });

    expect(JSON.stringify(andClauses(where))).not.toContain("lte");
    expect(JSON.stringify(andClauses(where))).not.toContain("gt");
  });

  it("scopes the activity probe to the tasks the reader may see", async () => {
    const ownReader = createMockUserWithPermissions([
      { resource: Resource.deals, action: Action.readAll },
      { resource: Resource.tasks, action: Action.readOwn },
    ]);

    const { where } = await runWithTenant(ownReader, () =>
      new PrismaDealRepo().buildQueryArgs({ filters: [nextActivityFilter(FilterOperatorKey.in, ["false"])] }),
    );

    expect(andClauses(where)).toEqual([
      {
        tasks: {
          none: {
            task: {
              companyId: ownReader.companyId,
              users: { some: { userId: ownReader.id } },
              ...SCHEDULED_TASK,
            },
          },
        },
      },
    ]);
  });

  it("ignores a filter that names both states or an operator it cannot read", async () => {
    const ambiguous = await queryArgs({ filters: [nextActivityFilter(FilterOperatorKey.in, ["true", "false"])] });
    const unsupported = await queryArgs({ filters: [nextActivityFilter(FilterOperatorKey.equals, ["false"])] });

    expect(andClauses(ambiguous.where)).toEqual([]);
    expect(andClauses(unsupported.where)).toEqual([]);
  });

  it("never leaks the filter into the generic where builder", async () => {
    const { where } = await queryArgs({
      filters: [nextActivityFilter(FilterOperatorKey.in, ["false"])],
    });

    expect(where).not.toHaveProperty(FilterFieldKey.nextActivity);
  });
});

describe("deal filterable fields", () => {
  it("offers the next activity and lost reason filters to a reader who may see both sources", async () => {
    const fields = await runWithTenant(user, () => new PrismaDealRepo().getFilterableFields());
    const offered = fields.map((field) => field.field);

    expect(offered).toContain(FilterFieldKey.nextActivity);
    expect(offered).toContain(FilterFieldKey.lostReasonId);
  });

  it("withholds the next activity filter from a reader with no access to tasks", async () => {
    const reader = createMockUserWithPermissions([
      { resource: Resource.deals, action: Action.readAll },
      { resource: Resource.company, action: Action.readAll },
    ]);

    const fields = await runWithTenant(reader, () => new PrismaDealRepo().getFilterableFields());
    const offered = fields.map((field) => field.field);

    expect(offered).not.toContain(FilterFieldKey.nextActivity);
    expect(offered).toContain(FilterFieldKey.lostReasonId);
  });

  it("withholds the lost reason filter from a reader with no access to the workspace settings", async () => {
    const reader = createMockUserWithPermissions([
      { resource: Resource.deals, action: Action.readAll },
      { resource: Resource.tasks, action: Action.readAll },
    ]);

    const fields = await runWithTenant(reader, () => new PrismaDealRepo().getFilterableFields());
    const offered = fields.map((field) => field.field);

    expect(offered).toContain(FilterFieldKey.nextActivity);
    expect(offered).not.toContain(FilterFieldKey.lostReasonId);
  });
});

describe("lost reason on the deal record", () => {
  it("carries the reason name so a list row can label a lost deal", async () => {
    const deal = await runWithTenant(user, () => new PrismaDealRepo().getDealById(fake.ids.deal));

    expect(deal?.lostReasonName).toBe("Price");
    expect(deal).not.toHaveProperty("lostReason");
  });

  it("sorts by the reason name rather than by its identifier", async () => {
    const { orderBy } = await queryArgs({ sortDescriptor: { field: "lostReason", direction: "asc" } });

    expect(orderBy).toEqual([{ lostReason: { name: "asc" } }, { id: "asc" }]);
  });
});
