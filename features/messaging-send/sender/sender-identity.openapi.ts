import type { ZodOpenApiOperationObject } from "zod-openapi";

import { SaveSenderIdentitySchema, SenderIdentityDtoSchema } from "./sender-identity.interactor";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const getSenderIdentityOperation: ZodOpenApiOperationObject = {
  operationId: "getSenderIdentity",
  summary: "Get the sender identity",
  description:
    "Returns the From name and address, the Reply-To and whether users may send as themselves, plus the DNS TXT record that proves the sending domain and whether it is verified. `configured` is false while the workspace sends as the installation's default sender.",
  tags: ["sender-identity"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The sender identity.",
      content: { "application/json": { schema: SenderIdentityDtoSchema } },
    },
    ...CommonApiResponses,
  },
};

export const saveSenderIdentityOperation: ZodOpenApiOperationObject = {
  operationId: "saveSenderIdentity",
  summary: "Set the sender identity",
  description:
    "Sets the From name and address and the Reply-To mail is sent with. Changing the address to another domain issues a new TXT record and clears the verification; until the domain is verified again every send is refused rather than falling back to another sender. With `allowUserSenders`, a message sent on a user's behalf goes out from that user's own address when it is on the verified domain. Requires permission to update the company.",
  tags: ["sender-identity"],
  security: [{ apiKeyAuth: [] }],
  requestBody: { required: true, content: { "application/json": { schema: SaveSenderIdentitySchema } } },
  responses: {
    "200": {
      description: "The sender identity was saved.",
      content: { "application/json": { schema: SenderIdentityDtoSchema } },
    },
    ...CommonApiResponses,
  },
};

export const verifySenderDomainOperation: ZodOpenApiOperationObject = {
  operationId: "verifySenderDomain",
  summary: "Verify the sending domain",
  description:
    "Looks up the TXT record `_crm-verify.<domain>` and marks the domain verified when it holds the expected value. DNS changes can take a while to appear. Requires permission to update the company.",
  tags: ["sender-identity"],
  security: [{ apiKeyAuth: [] }],
  requestBody: { required: false, description: "This action takes no request body.", content: {} },
  responses: {
    "200": {
      description: "The domain is verified.",
      content: { "application/json": { schema: SenderIdentityDtoSchema } },
    },
    "404": {
      description: "No sender identity is set.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
    "400": {
      description: "The TXT record is missing or does not match.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
};
