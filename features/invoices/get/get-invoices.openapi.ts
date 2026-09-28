import type { ZodOpenApiOperationObject } from "zod-openapi";

import { GetInvoicesSchema, InvoiceDtoSchema, InvoiceIdSchema, InvoiceListDtoSchema } from "../invoice.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const getInvoicesOperation: ZodOpenApiOperationObject = {
  operationId: "getInvoices",
  summary: "List invoices",
  description:
    "Lists invoices, newest first, 50 per page, optionally only one status or those of one deal or organization. `balance` is what is still open and `overdue` is true for an issued invoice past its due date. Requires read access to invoices.",
  tags: ["invoices"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { query: GetInvoicesSchema },
  responses: {
    "200": {
      description: "The invoices were retrieved.",
      content: { "application/json": { schema: InvoiceListDtoSchema } },
    },
    ...CommonApiResponses,
  },
};

export const getInvoiceOperation: ZodOpenApiOperationObject = {
  operationId: "getInvoice",
  summary: "Get an invoice",
  description:
    "Returns one invoice with its lines, tax breakdown per rate, payments and, once issued, the seller details it was issued with.",
  tags: ["invoices"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: InvoiceIdSchema },
  responses: {
    "200": { description: "The invoice was retrieved.", content: { "application/json": { schema: InvoiceDtoSchema } } },
    "404": {
      description: "No invoice with this ID exists.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
