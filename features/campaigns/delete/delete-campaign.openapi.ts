import type { ZodOpenApiOperationObject } from "zod-openapi";

import { CampaignDtoSchema, CampaignIdSchema } from "../campaign.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const deleteCampaignOperation: ZodOpenApiOperationObject = {
  operationId: "deleteCampaign",
  summary: "Delete a campaign draft",
  description:
    "Deletes a draft campaign. A campaign that is sending or has been sent is kept as a record of what was sent.",
  tags: ["campaigns"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: CampaignIdSchema },
  responses: {
    "200": {
      description: "The draft was deleted and is returned as it was.",
      content: { "application/json": { schema: CampaignDtoSchema } },
    },
    "404": {
      description: "No campaign with this ID exists.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
    "409": {
      description: "The campaign is no longer a draft.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
};
