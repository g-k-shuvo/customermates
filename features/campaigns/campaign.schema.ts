import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Action, CampaignRecipientStatus, CampaignStatus, Resource } from "@/generated/prisma";

import { AudienceDefinitionSchema } from "@/features/audience/audience.schema";
import { EmailImageUrlSchema } from "@/features/messaging-send/render/render-email-markdown";

export const CAMPAIGN_READ = { resource: Resource.campaigns, action: Action.readAll };
export const CAMPAIGN_WRITE = { resource: Resource.campaigns, action: Action.update };

export const CAMPAIGN_SEND_CHUNK = 25;
export const CAMPAIGN_RECIPIENT_PAGE = 25;

export const CampaignDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(CampaignStatus),
  subject: z.string(),
  bodyMarkdown: z.string(),
  bannerUrl: z.string().nullable(),
  audience: AudienceDefinitionSchema.nullable(),
  lawfulBasis: z.string().nullable(),
  senderUserId: z.uuid().nullable(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  sentCount: z.number().int(),
  suppressedCount: z.number().int(),
  failedCount: z.number().int(),
  pendingCount: z.number().int(),
  skippedCount: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type CampaignDto = Data<typeof CampaignDtoSchema>;

export const CampaignRecipientDtoSchema = z.object({
  contactId: z.uuid(),
  email: z.string(),
  status: z.enum(CampaignRecipientStatus),
  error: z.string().nullable(),
  updatedAt: z.date(),
});

export const CampaignRecipientsDtoSchema = z.object({
  items: z.array(CampaignRecipientDtoSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type CampaignRecipientsDto = Data<typeof CampaignRecipientsDtoSchema>;

const CampaignFields = z.object({
  name: z.string().trim().min(1).max(200),
  subject: z.string().trim().max(200).default(""),
  bodyMarkdown: z.string().max(20000).default(""),
  bannerUrl: EmailImageUrlSchema.nullable().default(null),
  audience: AudienceDefinitionSchema.nullable().default(null),
  lawfulBasis: z.string().trim().max(1000).nullable().default(null),
  senderUserId: z.uuid().nullable().default(null),
});

export const CreateCampaignSchema = CampaignFields;
export type CreateCampaignData = z.input<typeof CreateCampaignSchema>;

export const UpdateCampaignSchema = CampaignFields.extend({ id: z.uuid() });
export type UpdateCampaignData = z.input<typeof UpdateCampaignSchema>;

export const CampaignIdSchema = z.object({ id: z.uuid() });
export type CampaignIdData = Data<typeof CampaignIdSchema>;

export const GetCampaignRecipientsSchema = z.object({ id: z.uuid(), page: z.number().int().min(1).default(1) });
export type GetCampaignRecipientsData = z.input<typeof GetCampaignRecipientsSchema>;

export const CampaignChunkResultSchema = z.object({ remaining: z.number().int() });
export type CampaignChunkResult = Data<typeof CampaignChunkResultSchema>;
