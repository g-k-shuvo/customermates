import type { ZodOpenApiOperationObject } from "zod-openapi";

import { DismissDuplicateGroupSchema } from "../duplicate.schema";
import { DismissDuplicateGroupResultSchema } from "./dismiss-duplicate-group.interactor";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const dismissDuplicateGroupOperation: ZodOpenApiOperationObject = {
  operationId: "dismissDuplicateGroup",
  summary: "Mark a group as not duplicates",
  description:
    "Closes an open duplicate group and records every pair of its members as not duplicates, so later scans never pair them again, even inside a larger group. Requires read access to all contacts and permission to update contacts.",
  tags: ["duplicates"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: DismissDuplicateGroupSchema },
  requestBody: {
    required: false,
    description: "This action takes no request body; the group is identified by the path.",
    content: {},
  },
  responses: {
    "200": {
      description: "The group was dismissed.",
      content: { "application/json": { schema: DismissDuplicateGroupResultSchema } },
    },
    "404": {
      description: "No open duplicate group with this ID exists.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
