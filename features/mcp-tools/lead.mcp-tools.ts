import type { LeadDto } from "@/features/leads/lead.schema";

import { z } from "zod";

import { LeadStatus } from "@/generated/prisma";

import {
  CUSTOM_COLUMN_PREREQ,
  CUSTOM_FIELDS_MERGE_NOTE,
  CreatedRecordsOutputSchema,
  UpdatedRecordsOutputSchema,
  forbidNullFields,
  runInteractor,
  toonResult,
} from "./utils";

import {
  getConvertLeadToDealInteractor,
  getCreateManyLeadsInteractor,
  getGetLeadsApiInteractor,
  getUpdateManyLeadsInteractor,
} from "@/core/di";
import { BaseCreateLeadSchema } from "@/features/leads/upsert/create-lead-base.schema";
import { BaseUpdateLeadSchema } from "@/features/leads/upsert/update-lead-base.schema";
import { ConvertLeadToDealSchema } from "@/features/leads/convert/convert-lead-to-deal.interactor";

const PAGE_SIZE = 25;

const LeadRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  value: z.number().nullable(),
  owner: z.string().nullable(),
  contact: z.string().nullable(),
  organization: z.string().nullable(),
  convertedDealId: z.string().nullable(),
});

function rowOf(lead: LeadDto): z.infer<typeof LeadRowSchema> {
  return {
    id: lead.id,
    title: lead.title,
    status: lead.status,
    value: lead.value,
    owner: lead.owner ? `${lead.owner.firstName} ${lead.owner.lastName}`.trim() : null,
    contact: lead.contact ? `${lead.contact.firstName} ${lead.contact.lastName}`.trim() : null,
    organization: lead.organization?.name ?? null,
    convertedDealId: lead.convertedDealId,
  };
}

const ListLeadsSchema = z.object({
  search: z.string().trim().max(200).optional().describe("Matches the lead title"),
  status: z.array(z.enum(LeadStatus)).max(6).optional().describe("Only leads with one of these statuses"),
  page: z.number().int().min(1).optional().describe("1-based page of 25 leads, newest first"),
});

export const listLeadsTool = {
  name: "list_leads",
  title: "List leads",
  description: "List leads 25 per page, newest first, by title search and status.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: ListLeadsSchema,
  outputSchema: z.object({ items: z.array(LeadRowSchema), page: z.number(), total: z.number() }),
  execute: (params: z.infer<typeof ListLeadsSchema>) =>
    runInteractor(
      getGetLeadsApiInteractor().invoke({
        searchTerm: params.search,
        filters: params.status?.length ? [{ field: "leadStatus", operator: "in", value: params.status } as never] : [],
        pagination: { page: params.page ?? 1, pageSize: PAGE_SIZE },
      }),
      (data) =>
        toonResult({
          items: data.items.map(rowOf),
          page: data.pagination?.page ?? params.page ?? 1,
          total: data.pagination?.total ?? data.items.length,
        }),
    ),
};

const CreateLeadsSchema = z.object({
  leads: z
    .array(BaseCreateLeadSchema.omit({ notes: true, sourceId: true, sourceOrigin: true }).strict())
    .min(1)
    .max(100),
});

export const createLeadsTool = {
  name: "create_leads",
  title: "Create leads",
  description:
    "Create up to 100 leads. Required: title. Leads without ownerUserId get one from the lead assignment rules. " +
    CUSTOM_COLUMN_PREREQ,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  inputSchema: CreateLeadsSchema,
  outputSchema: CreatedRecordsOutputSchema,
  execute: (params: z.infer<typeof CreateLeadsSchema>) =>
    runInteractor(getCreateManyLeadsInteractor().invoke(params as never), (data) =>
      toonResult({ items: data.map((lead) => ({ id: lead.id, name: lead.title })) }),
    ),
};

const UpdateLeadsSchema = z.object({
  leads: z
    .array(
      forbidNullFields(BaseUpdateLeadSchema.omit({ notes: true, sourceId: true, sourceOrigin: true }).strict(), [
        "customFieldValues",
        "labels",
      ]),
    )
    .min(1)
    .max(100),
});

export const updateLeadsTool = {
  name: "update_leads",
  title: "Update leads",
  description:
    "Partial update for up to 100 leads. Required: id. null clears contactId, organizationId, ownerUserId or value; labels replaces the set. Convert with convert_lead_to_deal. " +
    CUSTOM_FIELDS_MERGE_NOTE,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateLeadsSchema,
  outputSchema: UpdatedRecordsOutputSchema,
  execute: (params: z.infer<typeof UpdateLeadsSchema>) =>
    runInteractor(
      getUpdateManyLeadsInteractor().invoke(params as never),
      (data) => `Updated ${data.length} lead(s)`,
      (data) => ({ updated: data.length }),
    ),
};

const ConvertLeadInputSchema = ConvertLeadToDealSchema.omit({ expectedCloseDate: true, probability: true });

export const convertLeadToDealTool = {
  name: "convert_lead_to_deal",
  title: "Convert lead to deal",
  description:
    "Convert a lead into a deal once; the deal inherits title, contact, organization, owner and value. Optional pipelineId and stageId.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  inputSchema: ConvertLeadInputSchema,
  outputSchema: z.object({ dealId: z.string(), name: z.string() }),
  execute: (params: z.infer<typeof ConvertLeadInputSchema>) =>
    runInteractor(getConvertLeadToDealInteractor().invoke(params), (deal) =>
      toonResult({ dealId: deal.id, name: deal.name }),
    ),
};
