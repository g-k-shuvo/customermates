import type { ZodOpenApiOperationObject } from "zod-openapi";

import { ContactListIdSchema, FillContactListResultSchema, FillContactListSchema } from "../contact-list.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const fillContactListOperation: ZodOpenApiOperationObject = {
  operationId: "fillContactList",
  summary: "Fill a contact list from a filter",
  description:
    "Adds every contact matching the filters and search term, in the same filter language as `POST /v1/contacts/search`, as a background job; contacts already on the list are kept once. Only contacts the caller may read are added. Returns the job; follow it with `GET /v1/bulk-jobs/{id}`.",
  tags: ["contact-lists"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: ContactListIdSchema },
  requestBody: {
    required: true,
    content: { "application/json": { schema: FillContactListSchema.omit({ id: true }) } },
  },
  responses: {
    "200": {
      description: "The fill was started.",
      content: { "application/json": { schema: FillContactListResultSchema } },
    },
    "404": {
      description: "No contact list with this ID exists.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
    "409": {
      description: "A fill of this list is already running.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
};
