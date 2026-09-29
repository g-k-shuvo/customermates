import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Action, EntityType, MessageKind, Resource } from "@/generated/prisma";

import { EmailImageUrlSchema } from "@/features/messaging-send/render/render-email-markdown";

export const MAX_TEMPLATE_BODY_LENGTH = 20_000;

export const TEMPLATE_READ = {
  permissions: [
    { resource: Resource.automations, action: Action.readAll },
    { resource: Resource.automations, action: Action.readOwn },
  ],
  condition: "OR" as const,
};
export const TEMPLATE_WRITE = { resource: Resource.automations, action: Action.update };

export const MessageTemplateIdSchema = z.object({ id: z.uuid() });
export type MessageTemplateIdData = Data<typeof MessageTemplateIdSchema>;

const TemplateFields = {
  name: z.string().trim().min(1).max(120),
  kind: z.enum(MessageKind),
  subject: z.string().trim().min(1).max(300),
  bodyMarkdown: z.string().trim().min(1).max(MAX_TEMPLATE_BODY_LENGTH),
  bannerUrl: EmailImageUrlSchema.nullable().optional(),
};

export const CreateMessageTemplateSchema = z.object(TemplateFields);
export type CreateMessageTemplateData = Data<typeof CreateMessageTemplateSchema>;

export const UpdateMessageTemplateSchema = z.object({ id: z.uuid(), ...TemplateFields }).partial({
  name: true,
  kind: true,
  subject: true,
  bodyMarkdown: true,
});
export type UpdateMessageTemplateData = Data<typeof UpdateMessageTemplateSchema>;

export const MessageTemplateDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(MessageKind),
  subject: z.string(),
  bodyMarkdown: z.string(),
  bannerUrl: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type MessageTemplateDto = Data<typeof MessageTemplateDtoSchema>;

export const PREVIEW_ENTITY_TYPES = [
  EntityType.contact,
  EntityType.organization,
  EntityType.deal,
  EntityType.lead,
] as const;

export const PreviewMessageTemplateSchema = z.object({
  subject: z.string().max(300),
  bodyMarkdown: z.string().max(MAX_TEMPLATE_BODY_LENGTH),
  bannerUrl: EmailImageUrlSchema.nullish(),
  record: z.object({ entityType: z.enum(PREVIEW_ENTITY_TYPES), entityId: z.uuid() }).nullish(),
});
export type PreviewMessageTemplateData = Data<typeof PreviewMessageTemplateSchema>;

export const MessageTemplatePreviewDtoSchema = z.object({ subject: z.string(), html: z.string(), text: z.string() });
export type MessageTemplatePreviewDto = Data<typeof MessageTemplatePreviewDtoSchema>;
