import type { ZodOpenApiOperationObject } from "zod-openapi";

import {
  BillingProfileDtoSchema,
  InvoiceSettingsDtoSchema,
  UpdateInvoiceSettingsSchema,
  UpsertBillingProfileSchema,
} from "../invoice.schema";

import { z } from "zod";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

const organizationPath = z.object({ id: z.uuid() });

export const getInvoiceSettingsOperation: ZodOpenApiOperationObject = {
  operationId: "getInvoiceSettings",
  summary: "Get invoicing settings",
  description:
    "Returns the seller details printed on invoices, the numbering (prefix and next number), the payment terms in days and the default tax rate.",
  tags: ["invoices"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The settings were retrieved.",
      content: { "application/json": { schema: InvoiceSettingsDtoSchema } },
    },
    ...CommonApiResponses,
  },
};

export const updateInvoiceSettingsOperation: ZodOpenApiOperationObject = {
  operationId: "updateInvoiceSettings",
  summary: "Update invoicing settings",
  description:
    "Changes the seller details, numbering, payment terms or default tax rate. Invoices already issued keep the details they were issued with. Requires permission to update the company.",
  tags: ["invoices"],
  security: [{ apiKeyAuth: [] }],
  requestBody: { required: true, content: { "application/json": { schema: UpdateInvoiceSettingsSchema } } },
  responses: {
    "200": {
      description: "The settings were updated.",
      content: { "application/json": { schema: InvoiceSettingsDtoSchema } },
    },
    ...CommonApiResponses,
  },
};

export const getBillingProfileOperation: ZodOpenApiOperationObject = {
  operationId: "getBillingProfile",
  summary: "Get an organization's billing details",
  description:
    "Returns the legal name, address, VAT ID and billing email used as the buyer on new invoices for this organization. Empty fields when none are set.",
  tags: ["invoices"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: organizationPath },
  responses: {
    "200": {
      description: "The billing details were retrieved.",
      content: { "application/json": { schema: BillingProfileDtoSchema } },
    },
    "404": {
      description: "The organization does not exist or the caller cannot see it.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};

export const upsertBillingProfileOperation: ZodOpenApiOperationObject = {
  operationId: "upsertBillingProfile",
  summary: "Set an organization's billing details",
  description:
    "Sets the billing details new invoices for this organization start from. Existing invoices keep their buyer.",
  tags: ["invoices"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: organizationPath },
  requestBody: {
    required: true,
    content: { "application/json": { schema: UpsertBillingProfileSchema.omit({ organizationId: true }) } },
  },
  responses: {
    "200": {
      description: "The billing details were saved.",
      content: { "application/json": { schema: BillingProfileDtoSchema } },
    },
    "404": {
      description: "The organization does not exist or the caller cannot see it.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
