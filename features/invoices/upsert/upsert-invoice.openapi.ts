import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CreateInvoiceSchema, InvoiceDtoSchema, InvoiceIdSchema, UpdateInvoiceSchema } from "../invoice.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const createInvoiceOperation: ZodOpenApiOperationObject = {
  operationId: "createInvoice",
  summary: "Create a draft invoice",
  description:
    "Creates a draft invoice. With `dealId` and no `lines`, the deal's base value becomes its own line and each service on the deal a line of its own, at the default tax rate. The buyer is taken from the organization's billing profile (the deal's first organization when `organizationId` is not given) unless buyer fields are passed. The currency defaults to the workspace currency. A draft has no number until it is issued.",
  tags: ["invoices"],
  security: [{ apiKeyAuth: [] }],
  requestBody: { required: true, content: { "application/json": { schema: CreateInvoiceSchema } } },
  responses: {
    "201": { description: "The draft was created.", content: { "application/json": { schema: InvoiceDtoSchema } } },
    "404": {
      description: "The deal or organization does not exist or the caller cannot see it.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};

export const updateInvoiceOperation: ZodOpenApiOperationObject = {
  operationId: "updateInvoice",
  summary: "Update a draft invoice",
  description:
    "Changes a draft's buyer, currency, due date, notes or lines. Passing `lines` replaces all lines. Issued invoices cannot be changed.",
  tags: ["invoices"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: InvoiceIdSchema.pick({ id: true }) },
  requestBody: { required: true, content: { "application/json": { schema: UpdateInvoiceSchema.omit({ id: true }) } } },
  responses: {
    "200": { description: "The draft was updated.", content: { "application/json": { schema: InvoiceDtoSchema } } },
    "404": {
      description: "No invoice with this ID exists.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "409": {
      description: "The invoice is no longer a draft.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};

export const deleteInvoiceOperation: ZodOpenApiOperationObject = {
  operationId: "deleteInvoice",
  summary: "Delete a draft invoice",
  description: "Deletes a draft. Issued invoices keep their number and can only be voided.",
  tags: ["invoices"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: InvoiceIdSchema },
  responses: {
    "200": {
      description: "The draft was deleted.",
      content: { "application/json": { schema: z.object({ id: z.uuid() }) } },
    },
    "404": {
      description: "No invoice with this ID exists.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "409": {
      description: "The invoice is no longer a draft.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
