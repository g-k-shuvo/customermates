import type { ZodOpenApiOperationObject } from "zod-openapi";

import { ChangeContactListMembersSchema, ContactListIdSchema, MemberChangeDtoSchema } from "../contact-list.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

const body = {
  required: true,
  content: { "application/json": { schema: ChangeContactListMembersSchema.omit({ id: true }) } },
};
const notFound = {
  "404": {
    description: "No contact list with this ID exists.",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const addContactListMembersOperation: ZodOpenApiOperationObject = {
  operationId: "addContactListMembers",
  summary: "Add contacts to a list",
  description:
    "Adds up to 100 contacts by ID. Contacts the caller may not read, and contacts already on the list, are skipped; `changed` is the number actually added. To add more, fill the list from a filter.",
  tags: ["contact-lists"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: ContactListIdSchema },
  requestBody: body,
  responses: {
    "200": {
      description: "The contacts were added.",
      content: { "application/json": { schema: MemberChangeDtoSchema } },
    },
    ...notFound,
    ...CommonApiResponses,
  },
};

export const removeContactListMembersOperation: ZodOpenApiOperationObject = {
  operationId: "removeContactListMembers",
  summary: "Remove contacts from a list",
  description: "Removes up to 100 contacts by ID from the list; `changed` is the number actually removed.",
  tags: ["contact-lists"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: ContactListIdSchema },
  requestBody: body,
  responses: {
    "200": {
      description: "The contacts were removed.",
      content: { "application/json": { schema: MemberChangeDtoSchema } },
    },
    ...notFound,
    ...CommonApiResponses,
  },
};
