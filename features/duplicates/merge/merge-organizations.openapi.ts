import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import {
  ContactMergeIdSchema,
  ContactMergeRecordDtoSchema,
  MergeContactsResultSchema,
  MergeOrganizationsSchema,
} from "../duplicate.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const mergeOrganizationsOperation: ZodOpenApiOperationObject = {
  operationId: "mergeOrganizations",
  summary: "Merge organizations",
  description:
    "Merges up to nine organizations into one. The winner keeps its id and gains every contact, deal, owner, task, lead, file, document and link of the others, and their notes are appended to its own. The name and each custom field come from the organization named in `fields`, or from the winner, then the first organization that has a value. The others are deleted; a snapshot keeps them so the merge can be undone for 30 days. Requires read access to all organizations and permission to update and delete organizations.",
  tags: ["duplicates"],
  security: [{ apiKeyAuth: [] }],
  requestBody: { required: true, content: { "application/json": { schema: MergeOrganizationsSchema } } },
  responses: {
    "200": {
      description: "The organizations were merged.",
      content: { "application/json": { schema: MergeContactsResultSchema } },
    },
    "404": {
      description: "An organization does not exist or the caller cannot see it.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};

export const undoOrganizationMergeOperation: ZodOpenApiOperationObject = {
  operationId: "undoOrganizationMerge",
  summary: "Undo an organization merge",
  description:
    "Restores the organizations a merge deleted, with their own ids, relations and custom fields, and returns the winner's name, notes and custom fields to what they were. Possible for 30 days, once.",
  tags: ["duplicates"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: ContactMergeIdSchema },
  requestBody: {
    required: false,
    description: "This action takes no request body; the merge is identified by the path.",
    content: {},
  },
  responses: {
    "200": {
      description: "The merge was undone.",
      content: { "application/json": { schema: MergeContactsResultSchema } },
    },
    "404": {
      description: "No merge with this ID exists.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "409": {
      description: "The merge was already undone, is older than 30 days, or its winner no longer exists.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};

export const getOrganizationMergesOperation: ZodOpenApiOperationObject = {
  operationId: "getOrganizationMerges",
  summary: "List recent organization merges",
  description: "Lists the 20 most recent organization merges, newest first, with whether each can still be undone.",
  tags: ["duplicates"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The recent merges were retrieved.",
      content: { "application/json": { schema: z.array(ContactMergeRecordDtoSchema) } },
    },
    ...CommonApiResponses,
  },
};
