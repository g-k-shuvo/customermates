import type { ZodOpenApiOperationObject } from "zod-openapi";

import { ContactListDtoSchema, ContactListIdSchema } from "../contact-list.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const deleteContactListOperation: ZodOpenApiOperationObject = {
  operationId: "deleteContactList",
  summary: "Delete a contact list",
  description: "Deletes a contact list and its memberships. The contacts themselves are kept.",
  tags: ["contact-lists"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: ContactListIdSchema },
  responses: {
    "200": {
      description: "The list was deleted and is returned as it was.",
      content: { "application/json": { schema: ContactListDtoSchema } },
    },
    "404": {
      description: "No contact list with this ID exists.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
