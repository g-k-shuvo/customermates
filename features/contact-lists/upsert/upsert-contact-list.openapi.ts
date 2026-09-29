import type { ZodOpenApiOperationObject } from "zod-openapi";

import {
  ContactListDtoSchema,
  ContactListIdSchema,
  CreateContactListSchema,
  UpdateContactListSchema,
} from "../contact-list.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

const nameTaken = {
  "409": {
    description: "Another contact list already has this name.",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const createContactListOperation: ZodOpenApiOperationObject = {
  operationId: "createContactList",
  summary: "Create a contact list",
  description: "Creates an empty contact list. Names are unique in the workspace, ignoring case.",
  tags: ["contact-lists"],
  security: [{ apiKeyAuth: [] }],
  requestBody: { required: true, content: { "application/json": { schema: CreateContactListSchema } } },
  responses: {
    "200": { description: "The list was created.", content: { "application/json": { schema: ContactListDtoSchema } } },
    ...CommonApiResponses,
    ...nameTaken,
  },
};

export const updateContactListOperation: ZodOpenApiOperationObject = {
  operationId: "updateContactList",
  summary: "Rename a contact list",
  description: "Changes a contact list's name and description.",
  tags: ["contact-lists"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: ContactListIdSchema },
  requestBody: {
    required: true,
    content: { "application/json": { schema: UpdateContactListSchema.omit({ id: true }) } },
  },
  responses: {
    "200": { description: "The list was updated.", content: { "application/json": { schema: ContactListDtoSchema } } },
    "404": {
      description: "No contact list with this ID exists.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
    ...nameTaken,
  },
};
