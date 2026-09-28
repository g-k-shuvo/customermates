import type { ZodOpenApiOperationObject } from "zod-openapi";

import { DuplicateGroupListDtoSchema, GetDuplicateGroupsSchema } from "../duplicate.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getDuplicateGroupsOperation: ZodOpenApiOperationObject = {
  operationId: "getDuplicateGroups",
  summary: "List duplicate groups",
  description:
    "Lists the open duplicate groups the latest scan found, strongest first, 25 per page, with each member's name, emails, phones and organizations and the signals that matched. `scan` describes the latest scan, including whether it is still running and which overly common values it skipped. Requires read access to all contacts.",
  tags: ["duplicates"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { query: GetDuplicateGroupsSchema },
  responses: {
    "200": {
      description: "The open duplicate groups were retrieved.",
      content: { "application/json": { schema: DuplicateGroupListDtoSchema } },
    },
    ...CommonApiResponses,
  },
};
