import type { ZodOpenApiOperationObject } from "zod-openapi";

import { CampaignDtoSchema, CampaignIdSchema } from "../campaign.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

const notFound = {
  "404": {
    description: "No campaign with this ID exists.",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const sendCampaignOperation: ZodOpenApiOperationObject = {
  operationId: "sendCampaign",
  summary: "Send a campaign",
  description:
    "Starts sending a draft campaign. It needs a subject, a body, an audience and a lawful basis, and its merge fields must be well formed. The audience is resolved in the background into recipients, then mail goes out in small batches: each recipient is sent at most once even if sending is interrupted and resumed, suppressed addresses are skipped, and every message carries a one-click unsubscribe link. Follow the progress with `GET /v1/campaigns/{id}`.",
  tags: ["campaigns"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: CampaignIdSchema },
  requestBody: { required: false, description: "This action takes no request body.", content: {} },
  responses: {
    "200": { description: "Sending has started.", content: { "application/json": { schema: CampaignDtoSchema } } },
    ...notFound,
    ...CommonApiResponses,
    "409": {
      description: "The campaign is not a draft, is incomplete, or has no lawful basis recorded.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
};

export const cancelCampaignOperation: ZodOpenApiOperationObject = {
  operationId: "cancelCampaign",
  summary: "Cancel a sending campaign",
  description:
    "Stops a campaign that is sending. Messages already sent stay sent; recipients not reached yet are marked skipped.",
  tags: ["campaigns"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: CampaignIdSchema },
  requestBody: { required: false, description: "This action takes no request body.", content: {} },
  responses: {
    "200": {
      description: "The campaign was cancelled.",
      content: { "application/json": { schema: CampaignDtoSchema } },
    },
    ...notFound,
    ...CommonApiResponses,
    "409": {
      description: "The campaign is not sending.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
};
