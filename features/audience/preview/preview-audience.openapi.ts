import type { ZodOpenApiOperationObject } from "zod-openapi";

import { AudienceDefinitionSchema, AudiencePreviewDtoSchema } from "../audience.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const previewAudienceOperation: ZodOpenApiOperationObject = {
  operationId: "previewAudience",
  summary: "Preview a campaign audience",
  description:
    "Counts the contacts an audience definition selects and returns the first 25 as a sample. Top-level conditions are combined with AND: on a list (`onList`), not on a list (`notOnList`), a contact custom field with one of the given values (`contactField`), or any of the contact's organizations with a custom field set to one of the given values (`organizationField`; single-select fields take option IDs). A group combines up to 10 of those conditions: `anyOf` matches when at least one does (OR), `noneOf` when none does (NOT). Groups do not nest. Only contacts with an email address count as recipients; `withoutEmail` is how many matched but have none. Only contacts the caller may read are counted. The sample is for checking the audience and is never exported.",
  tags: ["audiences"],
  security: [{ apiKeyAuth: [] }],
  requestBody: { required: true, content: { "application/json": { schema: AudienceDefinitionSchema } } },
  responses: {
    "200": {
      description: "The audience count and sample.",
      content: { "application/json": { schema: AudiencePreviewDtoSchema } },
    },
    "404": {
      description: "A list or custom field the definition names does not exist.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
