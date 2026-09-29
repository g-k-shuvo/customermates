import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { ContactListDtoSchema, ContactListIdSchema, ContactListMembersDtoSchema } from "../contact-list.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

const notFound = {
  "404": {
    description: "No contact list with this ID exists.",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const getContactListsOperation: ZodOpenApiOperationObject = {
  operationId: "getContactLists",
  summary: "List contact lists",
  description: "Lists the workspace's contact lists by name, each with its number of members.",
  tags: ["contact-lists"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The contact lists.",
      content: { "application/json": { schema: z.array(ContactListDtoSchema) } },
    },
    ...CommonApiResponses,
  },
};

export const getContactListOperation: ZodOpenApiOperationObject = {
  operationId: "getContactList",
  summary: "Get a contact list",
  description: "Returns one contact list with its number of members.",
  tags: ["contact-lists"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: ContactListIdSchema },
  responses: {
    "200": { description: "The contact list.", content: { "application/json": { schema: ContactListDtoSchema } } },
    ...notFound,
    ...CommonApiResponses,
  },
};

export const getContactListMembersOperation: ZodOpenApiOperationObject = {
  operationId: "getContactListMembers",
  summary: "List a contact list's members",
  description:
    "Returns the members of a contact list, newest first, 25 per page, with each contact's first email address. Only contacts the caller may read are returned and counted.",
  tags: ["contact-lists"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: ContactListIdSchema,
    query: z.object({ page: z.coerce.number().int().min(1).optional() }),
  },
  responses: {
    "200": {
      description: "A page of members.",
      content: { "application/json": { schema: ContactListMembersDtoSchema } },
    },
    ...notFound,
    ...CommonApiResponses,
  },
};
