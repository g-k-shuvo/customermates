import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import {
  CreateMessageTemplateSchema,
  MessageTemplateDtoSchema,
  MessageTemplateIdSchema,
  UpdateMessageTemplateSchema,
} from "../message-template.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

const error = (description: string) => ({
  description,
  content: { "application/json": { schema: ErrorResponseSchema } },
});

const MERGE_RULES =
  'Merge fields are `{{ contact.firstName }}`, `{{ contact.lastName }}`, `{{ contact.fullName }}`, `{{ contact.email }}`, `{{ organization.name }}`, `{{ deal.name }}` and `{{ sender.firstName }}`, `{{ sender.lastName }}`, `{{ sender.fullName }}`, `{{ sender.email }}`; a default is written `{{ contact.firstName | "there" }}`. An unknown or malformed field is refused when the template is saved.';

export const createMessageTemplateOperation: ZodOpenApiOperationObject = {
  operationId: "createMessageTemplate",
  summary: "Create a message template",
  description: `Creates an email template. \`kind\` is \`transactional\` or \`marketing\`; only marketing mail carries an unsubscribe link and is held back for suppressed addresses. ${MERGE_RULES} Names are unique per workspace, ignoring case. Requires permission to update automations.`,
  tags: ["message-templates"],
  security: [{ apiKeyAuth: [] }],
  requestBody: { required: true, content: { "application/json": { schema: CreateMessageTemplateSchema } } },
  responses: {
    "201": {
      description: "The template was created.",
      content: { "application/json": { schema: MessageTemplateDtoSchema } },
    },
    "409": error("Another template already has this name."),
    ...CommonApiResponses,
    "400": error("A merge field is unknown or malformed."),
  },
};

export const updateMessageTemplateOperation: ZodOpenApiOperationObject = {
  operationId: "updateMessageTemplate",
  summary: "Update a message template",
  description: `Changes a template's name, kind, subject or body. ${MERGE_RULES}`,
  tags: ["message-templates"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: MessageTemplateIdSchema },
  requestBody: {
    required: true,
    content: { "application/json": { schema: UpdateMessageTemplateSchema.omit({ id: true }) } },
  },
  responses: {
    "200": {
      description: "The template was updated.",
      content: { "application/json": { schema: MessageTemplateDtoSchema } },
    },
    "404": error("No template with this ID exists."),
    "409": error("Another template already has this name."),
    ...CommonApiResponses,
  },
};

export const deleteMessageTemplateOperation: ZodOpenApiOperationObject = {
  operationId: "deleteMessageTemplate",
  summary: "Delete a message template",
  description: "Deletes a template.",
  tags: ["message-templates"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: MessageTemplateIdSchema },
  responses: {
    "200": {
      description: "The template was deleted.",
      content: { "application/json": { schema: z.object({ id: z.uuid() }) } },
    },
    "404": error("No template with this ID exists."),
    ...CommonApiResponses,
  },
};
