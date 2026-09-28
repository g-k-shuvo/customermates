import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import {
  ContactMergeIdSchema,
  ContactMergeRecordDtoSchema,
  MergeContactsResultSchema,
  MergeContactsSchema,
} from "../duplicate.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const mergeContactsOperation: ZodOpenApiOperationObject = {
  operationId: "mergeContacts",
  summary: "Merge contacts",
  description:
    "Merges up to nine contacts into one. The winner keeps its id and gains every channel, organization, deal, task, owner, lead, file, document and link from the other contacts, and their notes are appended to its own. First name, last name and each custom field come from the contact named in `fields`, or from the winner, then the first contact that has a value. The other contacts are deleted. Everything they held is kept in a snapshot, so the merge can be undone for 30 days. Pass `groupId` to close the duplicate group the merge came from. Requires read access to all contacts and permission to update and delete contacts.",
  tags: ["duplicates"],
  security: [{ apiKeyAuth: [] }],
  requestBody: { required: true, content: { "application/json": { schema: MergeContactsSchema } } },
  responses: {
    "200": {
      description: "The contacts were merged.",
      content: { "application/json": { schema: MergeContactsResultSchema } },
    },
    "404": {
      description: "A contact does not exist or the caller cannot see it.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};

export const undoContactMergeOperation: ZodOpenApiOperationObject = {
  operationId: "undoContactMerge",
  summary: "Undo a contact merge",
  description:
    "Restores the contacts a merge deleted, with their own ids, channels, relations and custom fields, and returns the winner's names, notes and custom fields to what they were. Records linked to the winner after the merge stay with the winner. Possible for 30 days, once.",
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

export const getContactMergesOperation: ZodOpenApiOperationObject = {
  operationId: "getContactMerges",
  summary: "List recent contact merges",
  description: "Lists the 20 most recent contact merges, newest first, with whether each can still be undone.",
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
