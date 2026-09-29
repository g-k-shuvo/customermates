import type { ZodOpenApiOperationObject } from "zod-openapi";

import { MessageTemplatePreviewDtoSchema, PreviewMessageTemplateSchema } from "../message-template.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const previewMessageTemplateOperation: ZodOpenApiOperationObject = {
  operationId: "previewMessageTemplate",
  summary: "Preview a message template",
  description:
    "Renders a subject and Markdown body the way it would be sent: merge fields are filled from `record` (a contact, organization, deal or lead the caller can see; the contact of a deal or lead is its first one) and from the caller as the sender, values are escaped, and the result is email-safe HTML plus a plain-text copy. A field the record cannot fill and that has no default is refused with 400 naming the field, which is what a send would do.",
  tags: ["message-templates"],
  security: [{ apiKeyAuth: [] }],
  requestBody: { required: true, content: { "application/json": { schema: PreviewMessageTemplateSchema } } },
  responses: {
    "200": {
      description: "The rendered message.",
      content: { "application/json": { schema: MessageTemplatePreviewDtoSchema } },
    },
    ...CommonApiResponses,
  },
};
