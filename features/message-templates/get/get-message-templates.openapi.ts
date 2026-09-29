import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { MessageTemplateDtoSchema, MessageTemplateIdSchema } from "../message-template.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const getMessageTemplatesOperation: ZodOpenApiOperationObject = {
  operationId: "getMessageTemplates",
  summary: "List message templates",
  description:
    "Lists the workspace's email templates by name. A template stores a subject and a Markdown body with merge fields such as `{{ contact.firstName }}`; it is rendered to email-safe HTML only when a message is sent. Requires read access to automations.",
  tags: ["message-templates"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The templates were retrieved.",
      content: { "application/json": { schema: z.array(MessageTemplateDtoSchema) } },
    },
    ...CommonApiResponses,
  },
};

export const getMessageTemplateOperation: ZodOpenApiOperationObject = {
  operationId: "getMessageTemplate",
  summary: "Get a message template",
  description: "Returns one template with its subject and Markdown body.",
  tags: ["message-templates"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: MessageTemplateIdSchema },
  responses: {
    "200": {
      description: "The template was retrieved.",
      content: { "application/json": { schema: MessageTemplateDtoSchema } },
    },
    "404": {
      description: "No template with this ID exists.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
