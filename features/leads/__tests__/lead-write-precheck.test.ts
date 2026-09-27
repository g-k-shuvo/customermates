import type { z } from "zod";

import type { TenantUser } from "@/features/user/user.schema";
import type { LeadRelations } from "../find-lead-relations.repo";
import type { CreateLeadData } from "../upsert/create-lead.interactor";
import type { UpdateLeadData } from "../upsert/update-lead.interactor";
import type { CreateManyLeadsData } from "../upsert/create-many-leads.interactor";
import type { UpdateManyLeadsData } from "../upsert/update-many-leads.interactor";
import type { ConvertLeadToDealData } from "../convert/convert-lead-to-deal.interactor";

import { describe, expect, it, vi } from "vitest";

import { Action, CustomColumnType, EntityType, Resource } from "@/generated/prisma";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { ValidateAssigneeGuardInteractor } from "@/core/validation/validators/validate-assignee-guard.interactor";
import { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import { ValidateCustomFieldValuesInteractor } from "@/core/validation/validators/validate-custom-field-values.interactor";
import { ValidateLeadIdsInteractor } from "@/core/validation/validators/validate-lead-ids.interactor";
import { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import { ValidatePipelineIdsInteractor } from "@/core/validation/validators/validate-pipeline-ids.interactor";
import { ValidatePipelineStageIdsInteractor } from "@/core/validation/validators/validate-pipeline-stage-ids.interactor";
import { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import { ValidateWebFormSourceIdsInteractor } from "@/core/validation/validators/validate-web-form-source-ids.interactor";
import { DealWritePrecheckInteractor } from "@/features/deals/upsert/deal-write-precheck.interactor";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { LeadWritePrecheckInteractor } from "../upsert/lead-write-precheck.interactor";

vi.mock("@/core/di", () => ({}));

const SELF = "00000000-0000-4000-8000-00000000a001";
const COLLEAGUE = "00000000-0000-4000-8000-00000000a002";
const FOREIGN_USER = "00000000-0000-4000-8000-00000000a003";

const OWN_LEAD = "00000000-0000-4000-8000-00000000b001";
const COLLEAGUE_LEAD = "00000000-0000-4000-8000-00000000b002";

const CONTACT = "00000000-0000-4000-8000-00000000c001";
const HIDDEN_CONTACT = "00000000-0000-4000-8000-00000000c002";
const ORGANIZATION = "00000000-0000-4000-8000-00000000d001";
const HIDDEN_ORGANIZATION = "00000000-0000-4000-8000-00000000d002";
const SOURCE = "00000000-0000-4000-8000-00000000e001";
const FOREIGN_SOURCE = "00000000-0000-4000-8000-00000000e002";

const PIPELINE = "00000000-0000-4000-8000-00000000f001";
const OTHER_PIPELINE = "00000000-0000-4000-8000-00000000f002";
const ARCHIVED_PIPELINE = "00000000-0000-4000-8000-00000000f003";
const FOREIGN_PIPELINE = "00000000-0000-4000-8000-00000000f004";
const STAGE = "00000000-0000-4000-8000-00000000f101";
const OTHER_PIPELINE_STAGE = "00000000-0000-4000-8000-00000000f102";
const ARCHIVED_PIPELINE_STAGE = "00000000-0000-4000-8000-00000000f103";
const FOREIGN_STAGE = "00000000-0000-4000-8000-00000000f104";

const LEAD_DATE_COLUMN = "00000000-0000-4000-8000-0000000c0001";
const DEAL_COLUMN = "00000000-0000-4000-8000-0000000c0002";

const PIPELINE_BY_STAGE = new Map([
  [STAGE, PIPELINE],
  [OTHER_PIPELINE_STAGE, OTHER_PIPELINE],
  [ARCHIVED_PIPELINE_STAGE, ARCHIVED_PIPELINE],
]);

type Issue = { params?: { error?: CustomErrorCode }; path?: (string | number)[] };

function lookup(reachable: string[]) {
  const known = new Set(reachable);

  return {
    findIds: vi.fn((ids: Set<string>) => Promise.resolve(new Set([...ids].filter((id) => known.has(id))))),
  };
}

function permitted(user: TenantUser, resource: Resource, action: Action) {
  if (!user.role) return false;
  if (user.role.isSystemRole) return true;

  return user.role.permissions.some((permission) => permission.resource === resource && permission.action === action);
}

const ADMIN = { ...createMockUser(), id: SELF };

const OWN_LEADS_ONLY = {
  ...createMockUserWithPermissions([
    { resource: Resource.leads, action: Action.readOwn },
    { resource: Resource.leads, action: Action.create },
    { resource: Resource.leads, action: Action.update },
    { resource: Resource.deals, action: Action.create },
    { resource: Resource.deals, action: Action.readOwn },
    { resource: Resource.users, action: Action.readOwn },
  ]),
  id: SELF,
};

const ALL_LEADS_OWN_DEALS = {
  ...createMockUserWithPermissions([
    { resource: Resource.leads, action: Action.readAll },
    { resource: Resource.leads, action: Action.update },
    { resource: Resource.deals, action: Action.create },
    { resource: Resource.deals, action: Action.readOwn },
  ]),
  id: SELF,
};

function makePrecheck(options: { user?: TenantUser; stored?: Record<string, Partial<LeadRelations>> } = {}) {
  const user = options.user ?? ADMIN;
  const stored = new Map(
    Object.entries(options.stored ?? {}).map(([id, relations]): [string, LeadRelations] => [
      id,
      { contactId: null, organizationId: null, ownerUserId: null, sourceId: null, ...relations },
    ]),
  );

  const contacts = lookup([CONTACT]);
  const organizations = lookup([ORGANIZATION]);
  const users = lookup([SELF, COLLEAGUE]);
  const sources = lookup([SOURCE]);
  const relationsRepo = {
    findRelationsByLeadIds: vi.fn((ids: Set<string>) =>
      Promise.resolve(new Map([...stored].filter(([id]) => ids.has(id)))),
    ),
  };
  const customColumns = {
    findByEntityType: vi.fn((entityType: EntityType) =>
      Promise.resolve(
        entityType === EntityType.lead
          ? [
              {
                id: LEAD_DATE_COLUMN,
                label: "Follow-up date",
                entityType: EntityType.lead,
                type: CustomColumnType.date,
              },
            ]
          : [{ id: DEAL_COLUMN, label: "Deal notes", entityType: EntityType.deal, type: CustomColumnType.plain }],
      ),
    ),
  };
  const userService = {
    getActiveTenantUserOrThrow: vi.fn().mockResolvedValue(user),
    hasPermissionForUser: permitted,
  };
  const assigneeGuard = new ValidateAssigneeGuardInteractor(userService as never);
  const passing = { invoke: vi.fn().mockResolvedValue(undefined) } as never;
  const archivedPipelines = {
    findArchivedIds: vi.fn((ids: Set<string>) =>
      Promise.resolve(new Set([...ids].filter((id) => id === ARCHIVED_PIPELINE))),
    ),
  };
  const stagePipelines = {
    findPipelineIdsByStageIds: vi.fn((ids: Set<string>) =>
      Promise.resolve(new Map([...PIPELINE_BY_STAGE].filter(([stageId]) => ids.has(stageId)))),
    ),
  };
  const dealPrecheck = new DealWritePrecheckInteractor(
    passing,
    passing,
    passing,
    passing,
    passing,
    passing,
    passing,
    passing,
    new ValidatePipelineIdsInteractor(lookup([PIPELINE, OTHER_PIPELINE, ARCHIVED_PIPELINE]) as never),
    new ValidatePipelineStageIdsInteractor(lookup([STAGE, OTHER_PIPELINE_STAGE, ARCHIVED_PIPELINE_STAGE]) as never),
    stagePipelines,
    archivedPipelines,
    { findPipelineIdsByDealIds: vi.fn().mockResolvedValue(new Map()) },
    passing,
  );

  const precheck = new LeadWritePrecheckInteractor(
    new ValidateLeadIdsInteractor(
      lookup(permitted(user, Resource.leads, Action.readAll) ? [OWN_LEAD, COLLEAGUE_LEAD] : [OWN_LEAD]) as never,
    ),
    new ValidateContactIdsInteractor(contacts as never),
    new ValidateOrganizationIdsInteractor(organizations as never),
    new ValidateUserIdsInteractor(users as never),
    new ValidateCustomFieldValuesInteractor(customColumns as never),
    assigneeGuard,
    new ValidateWebFormSourceIdsInteractor(sources as never),
    relationsRepo,
    dealPrecheck,
  );

  const issues: Issue[] = [];
  const ctx = { addIssue: (issue: Issue) => issues.push(issue) } as unknown as z.RefinementCtx;

  return { precheck, ctx, issues, contacts, users, customColumns };
}

function found(issues: Issue[]) {
  return issues.map((issue) => ({ code: issue.params?.error, path: issue.path }));
}

function createData(overrides: Partial<CreateLeadData> = {}) {
  return {
    title: "Call back from the footer form",
    status: "new",
    sourceOrigin: "manual",
    labels: [],
    customFieldValues: [],
    ...overrides,
  } as CreateLeadData;
}

describe("LeadWritePrecheckInteractor on create", () => {
  it("rejects contact, organization, owner and source ids outside the caller's reach, each at its own field", async () => {
    const { precheck, ctx, issues } = makePrecheck();

    await precheck.create(
      createData({
        contactId: HIDDEN_CONTACT,
        organizationId: HIDDEN_ORGANIZATION,
        ownerUserId: FOREIGN_USER,
        sourceId: FOREIGN_SOURCE,
      }),
      ctx,
    );

    expect(found(issues)).toEqual(
      expect.arrayContaining([
        { code: CustomErrorCode.contactNotFound, path: ["contactId"] },
        { code: CustomErrorCode.organizationNotFound, path: ["organizationId"] },
        { code: CustomErrorCode.userNotFound, path: ["ownerUserId"] },
        { code: CustomErrorCode.webFormSourceNotFound, path: ["sourceId"] },
      ]),
    );
    expect(issues).toHaveLength(4);
  });

  it("accepts ids the caller can reach", async () => {
    const { precheck, ctx, issues } = makePrecheck();

    await precheck.create(
      createData({ contactId: CONTACT, organizationId: ORGANIZATION, ownerUserId: COLLEAGUE, sourceId: SOURCE }),
      ctx,
    );

    expect(issues).toEqual([]);
  });

  it("makes a caller who only sees their own leads own the lead they create", async () => {
    const unowned = makePrecheck({ user: OWN_LEADS_ONLY });
    await unowned.precheck.create(createData(), unowned.ctx);

    const forColleague = makePrecheck({ user: OWN_LEADS_ONLY });
    await forColleague.precheck.create(createData({ ownerUserId: COLLEAGUE }), forColleague.ctx);

    const forSelf = makePrecheck({ user: OWN_LEADS_ONLY });
    await forSelf.precheck.create(createData({ ownerUserId: SELF }), forSelf.ctx);

    expect(found(unowned.issues)).toEqual([{ code: CustomErrorCode.assigneeRequired, path: ["ownerUserId"] }]);
    expect(found(forColleague.issues)).toEqual(
      expect.arrayContaining([{ code: CustomErrorCode.assigneeRequired, path: ["ownerUserId"] }]),
    );
    expect(forSelf.issues).toEqual([]);
  });

  it("checks custom field values against this company's lead columns", async () => {
    const { precheck, ctx, issues, customColumns } = makePrecheck();

    await precheck.create(
      createData({
        customFieldValues: [
          { columnId: DEAL_COLUMN, value: "belongs to deals" },
          { columnId: LEAD_DATE_COLUMN, value: "next tuesday" },
        ],
      }),
      ctx,
    );

    expect(customColumns.findByEntityType).toHaveBeenCalledWith(EntityType.lead);
    expect(found(issues)).toEqual([
      { code: CustomErrorCode.customColumnNotFound, path: ["customFieldValues", 0, "columnId"] },
      { code: CustomErrorCode.customFieldInvalidDate, path: ["customFieldValues", 1, "value"] },
    ]);
  });
});

describe("LeadWritePrecheckInteractor on update", () => {
  it("reports a lead the caller cannot see as not found", async () => {
    const { precheck, ctx, issues } = makePrecheck({ user: OWN_LEADS_ONLY });

    await precheck.update({ id: COLLEAGUE_LEAD } as UpdateLeadData, ctx);

    expect(found(issues)).toEqual([{ code: CustomErrorCode.leadNotFound, path: ["id"] }]);
  });

  it("validates a relation the update changes", async () => {
    const { precheck, ctx, issues } = makePrecheck({ stored: { [OWN_LEAD]: { contactId: CONTACT } } });

    await precheck.update(
      {
        id: OWN_LEAD,
        contactId: HIDDEN_CONTACT,
        sourceId: FOREIGN_SOURCE,
        ownerUserId: FOREIGN_USER,
      } as UpdateLeadData,
      ctx,
    );

    expect(found(issues)).toEqual(
      expect.arrayContaining([
        { code: CustomErrorCode.contactNotFound, path: ["contactId"] },
        { code: CustomErrorCode.webFormSourceNotFound, path: ["sourceId"] },
        { code: CustomErrorCode.userNotFound, path: ["ownerUserId"] },
      ]),
    );
    expect(issues).toHaveLength(3);
  });

  it("leaves relations the update resends unchanged alone, even when the caller cannot see them", async () => {
    const { precheck, ctx, issues, contacts, users } = makePrecheck({
      stored: { [OWN_LEAD]: { contactId: HIDDEN_CONTACT, ownerUserId: FOREIGN_USER } },
    });

    await precheck.update(
      { id: OWN_LEAD, title: "Renamed", contactId: HIDDEN_CONTACT, ownerUserId: FOREIGN_USER } as UpdateLeadData,
      ctx,
    );

    expect(issues).toEqual([]);
    expect(contacts.findIds).not.toHaveBeenCalledWith(new Set([HIDDEN_CONTACT]));
    expect(users.findIds).not.toHaveBeenCalledWith(new Set([FOREIGN_USER]));
  });

  it("never validates a relation the update clears", async () => {
    const { precheck, ctx, issues } = makePrecheck({ stored: { [OWN_LEAD]: { contactId: CONTACT } } });

    await precheck.update(
      { id: OWN_LEAD, contactId: null, organizationId: null, sourceId: null } as UpdateLeadData,
      ctx,
    );

    expect(issues).toEqual([]);
  });

  it("guards the owner when an update changes or clears it, and not when it omits it", async () => {
    const stored = { [OWN_LEAD]: { ownerUserId: SELF } };

    const cleared = makePrecheck({ user: OWN_LEADS_ONLY, stored });
    await cleared.precheck.update({ id: OWN_LEAD, ownerUserId: null } as UpdateLeadData, cleared.ctx);

    const handedOver = makePrecheck({ user: OWN_LEADS_ONLY, stored });
    await handedOver.precheck.update({ id: OWN_LEAD, ownerUserId: COLLEAGUE } as UpdateLeadData, handedOver.ctx);

    const omitted = makePrecheck({ user: OWN_LEADS_ONLY, stored });
    await omitted.precheck.update({ id: OWN_LEAD, title: "Renamed" } as UpdateLeadData, omitted.ctx);

    const kept = makePrecheck({ user: OWN_LEADS_ONLY, stored });
    await kept.precheck.update({ id: OWN_LEAD, ownerUserId: SELF } as UpdateLeadData, kept.ctx);

    expect(found(cleared.issues)).toEqual([{ code: CustomErrorCode.assigneeRequired, path: ["ownerUserId"] }]);
    expect(found(handedOver.issues)).toEqual(
      expect.arrayContaining([{ code: CustomErrorCode.assigneeRequired, path: ["ownerUserId"] }]),
    );
    expect(omitted.issues).toEqual([]);
    expect(kept.issues).toEqual([]);
  });
});

describe("LeadWritePrecheckInteractor on bulk writes", () => {
  it("reports every unreachable id at its row on a bulk create", async () => {
    const { precheck, ctx, issues } = makePrecheck();

    await precheck.createMany(
      {
        leads: [createData({ sourceId: SOURCE }), createData({ sourceId: FOREIGN_SOURCE, contactId: HIDDEN_CONTACT })],
      } as CreateManyLeadsData,
      ctx,
    );

    expect(found(issues)).toEqual(
      expect.arrayContaining([
        { code: CustomErrorCode.webFormSourceNotFound, path: ["leads", 1, "sourceId"] },
        { code: CustomErrorCode.contactNotFound, path: ["leads", 1, "contactId"] },
      ]),
    );
    expect(issues).toHaveLength(2);
  });

  it("guards owners and validates changed relations per row on a bulk update", async () => {
    const { precheck, ctx, issues } = makePrecheck({
      user: OWN_LEADS_ONLY,
      stored: { [OWN_LEAD]: { ownerUserId: SELF, sourceId: SOURCE } },
    });

    await precheck.updateMany(
      {
        leads: [
          { id: OWN_LEAD, sourceId: SOURCE, title: "Kept" },
          { id: OWN_LEAD, ownerUserId: null, sourceId: FOREIGN_SOURCE },
          { id: COLLEAGUE_LEAD, title: "Not mine" },
        ],
      } as UpdateManyLeadsData,
      ctx,
    );

    expect(found(issues)).toEqual(
      expect.arrayContaining([
        { code: CustomErrorCode.assigneeRequired, path: ["leads", 1, "ownerUserId"] },
        { code: CustomErrorCode.webFormSourceNotFound, path: ["leads", 1, "sourceId"] },
        { code: CustomErrorCode.leadNotFound, path: ["leads", 2, "id"] },
      ]),
    );
    expect(issues).toHaveLength(3);
  });
});

describe("LeadWritePrecheckInteractor on convert", () => {
  async function convert(data: Partial<ConvertLeadToDealData>, options: Parameters<typeof makePrecheck>[0] = {}) {
    const { precheck, ctx, issues } = makePrecheck({ stored: { [OWN_LEAD]: { ownerUserId: SELF } }, ...options });

    await precheck.convert({ id: OWN_LEAD, ...data } as ConvertLeadToDealData, ctx);

    return found(issues);
  }

  it("rejects a pipeline or stage outside the company", async () => {
    expect(await convert({ pipelineId: FOREIGN_PIPELINE })).toEqual([
      { code: CustomErrorCode.pipelineNotFound, path: ["pipelineId"] },
    ]);
    expect(await convert({ stageId: FOREIGN_STAGE })).toEqual([
      { code: CustomErrorCode.pipelineStageNotFound, path: ["stageId"] },
    ]);
  });

  it("rejects a stage that belongs to another pipeline", async () => {
    expect(await convert({ pipelineId: PIPELINE, stageId: OTHER_PIPELINE_STAGE })).toEqual([
      { code: CustomErrorCode.pipelineStageMismatch, path: ["stageId"] },
    ]);
  });

  it("rejects an archived pipeline, named directly or through one of its stages", async () => {
    expect(await convert({ pipelineId: ARCHIVED_PIPELINE })).toEqual([
      { code: CustomErrorCode.pipelineArchived, path: ["pipelineId"] },
    ]);
    expect(await convert({ stageId: ARCHIVED_PIPELINE_STAGE })).toEqual([
      { code: CustomErrorCode.pipelineArchived, path: ["stageId"] },
    ]);
  });

  it("accepts a matching placement, or none", async () => {
    expect(await convert({ pipelineId: PIPELINE, stageId: STAGE })).toEqual([]);
    expect(await convert({})).toEqual([]);
  });

  it("holds the deal it creates to the deal assignee guard for the owner it inherits", async () => {
    const colleagueOwned = { stored: { [OWN_LEAD]: { ownerUserId: COLLEAGUE } } };
    const unowned = { stored: { [OWN_LEAD]: { ownerUserId: null } } };

    expect(await convert({}, { user: ALL_LEADS_OWN_DEALS, ...colleagueOwned })).toEqual([
      { code: CustomErrorCode.assigneeRequired, path: ["ownerUserId"] },
    ]);
    expect(await convert({}, { user: ALL_LEADS_OWN_DEALS, ...unowned })).toEqual([
      { code: CustomErrorCode.assigneeRequired, path: ["ownerUserId"] },
    ]);
    expect(await convert({}, { user: ALL_LEADS_OWN_DEALS })).toEqual([]);
    expect(await convert({}, { user: ADMIN, ...colleagueOwned })).toEqual([]);
  });

  it("reports only the missing lead when the caller cannot see it", async () => {
    const { precheck, ctx, issues } = makePrecheck({ user: OWN_LEADS_ONLY });

    await precheck.convert({ id: COLLEAGUE_LEAD } as ConvertLeadToDealData, ctx);

    expect(found(issues)).toEqual([{ code: CustomErrorCode.leadNotFound, path: ["id"] }]);
  });
});
