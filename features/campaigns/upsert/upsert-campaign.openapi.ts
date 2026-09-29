import type { ZodOpenApiOperationObject } from "zod-openapi";

import { CampaignDtoSchema, CampaignIdSchema, CreateCampaignSchema, UpdateCampaignSchema } from "../campaign.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const createCampaignOperation: ZodOpenApiOperationObject = {
  operationId: "createCampaign",
  summary: "Create a campaign draft",
  description:
    "Creates a draft campaign. `bodyMarkdown` and `subject` use the email template merge fields, filled per recipient from the contact. `audience` uses the definition of `POST /v1/audiences/preview`. `lawfulBasis` records why the recipients may be emailed (for example documented consent) and must be set before the campaign can be sent.",
  tags: ["campaigns"],
  security: [{ apiKeyAuth: [] }],
  requestBody: { required: true, content: { "application/json": { schema: CreateCampaignSchema } } },
  responses: {
    "200": { description: "The draft was created.", content: { "application/json": { schema: CampaignDtoSchema } } },
    ...CommonApiResponses,
  },
};

export const updateCampaignOperation: ZodOpenApiOperationObject = {
  operationId: "updateCampaign",
  summary: "Update a campaign draft",
  description: "Replaces a draft campaign's fields. A campaign that is sending or has been sent cannot be changed.",
  tags: ["campaigns"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: CampaignIdSchema },
  requestBody: { required: true, content: { "application/json": { schema: UpdateCampaignSchema.omit({ id: true }) } } },
  responses: {
    "200": { description: "The draft was updated.", content: { "application/json": { schema: CampaignDtoSchema } } },
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
