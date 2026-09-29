import type { ZodOpenApiOperationObject } from "zod-openapi";

import { BulkJobDtoSchema, BulkJobIdSchema } from "../bulk-job.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const getBulkJobOperation: ZodOpenApiOperationObject = {
  operationId: "getBulkJob",
  summary: "Get a bulk job",
  description:
    "Returns the progress of a background job that fills a contact list or sends a campaign: its status, how many records it has processed, the count it expected when it started and the count it confirmed when it finished. `stale` is true when the two counts differ because records changed while the job ran.",
  tags: ["bulk-jobs"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: BulkJobIdSchema },
  responses: {
    "200": { description: "The job was retrieved.", content: { "application/json": { schema: BulkJobDtoSchema } } },
    "404": {
      description: "No job with this ID exists.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
