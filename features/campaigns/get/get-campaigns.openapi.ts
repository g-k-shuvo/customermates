import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CampaignDtoSchema, CampaignIdSchema, CampaignRecipientsDtoSchema } from "../campaign.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

const notFound = {
  "404": {
    description: "No campaign with this ID exists.",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const getCampaignsOperation: ZodOpenApiOperationObject = {
  operationId: "getCampaigns",
  summary: "List campaigns",
  description:
    "Lists the workspace's email campaigns, newest first, with their status and how many recipients were sent, suppressed, failed or are still pending. Requires permission to read campaigns.",
  tags: ["campaigns"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": { description: "The campaigns.", content: { "application/json": { schema: z.array(CampaignDtoSchema) } } },
    ...CommonApiResponses,
  },
};

export const getCampaignOperation: ZodOpenApiOperationObject = {
  operationId: "getCampaign",
  summary: "Get a campaign",
  description: "Returns one campaign with its content, audience, lawful basis and delivery counts.",
  tags: ["campaigns"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: CampaignIdSchema },
  responses: {
    "200": { description: "The campaign.", content: { "application/json": { schema: CampaignDtoSchema } } },
    ...notFound,
    ...CommonApiResponses,
  },
};

export const getCampaignRecipientsOperation: ZodOpenApiOperationObject = {
  operationId: "getCampaignRecipients",
  summary: "List a campaign's recipients",
  description:
    "Returns the recipients a sending or sent campaign resolved, most recently changed first, 25 per page, each with its status (pending, sent, suppressed, failed or skipped) and, for a failure or suppression, the reason.",
  tags: ["campaigns"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: CampaignIdSchema, query: z.object({ page: z.coerce.number().int().min(1).optional() }) },
  responses: {
    "200": {
      description: "A page of recipients.",
      content: { "application/json": { schema: CampaignRecipientsDtoSchema } },
    },
    ...notFound,
    ...CommonApiResponses,
  },
};
