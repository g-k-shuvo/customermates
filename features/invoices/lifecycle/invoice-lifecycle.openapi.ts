import type { ZodOpenApiOperationObject } from "zod-openapi";

import {
  DeleteInvoicePaymentSchema,
  InvoiceDtoSchema,
  InvoiceIdSchema,
  RecordInvoicePaymentSchema,
} from "../invoice.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

const notFound = {
  description: "No invoice with this ID exists.",
  content: { "application/json": { schema: ErrorResponseSchema } },
};

export const issueInvoiceOperation: ZodOpenApiOperationObject = {
  operationId: "issueInvoice",
  summary: "Issue an invoice",
  description:
    "Issues a draft: it gets the next number from the invoicing settings (prefix plus a four-digit sequence), today's date as the issue date, a due date from the payment terms unless the draft set one, and a copy of the seller details, which later changes to the settings do not alter. Refused while the seller's legal name or address is missing, while the buyer's name or address is missing, or when the draft has no lines.",
  tags: ["invoices"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: InvoiceIdSchema },
  requestBody: { required: false, description: "This action takes no request body.", content: {} },
  responses: {
    "200": { description: "The invoice was issued.", content: { "application/json": { schema: InvoiceDtoSchema } } },
    "404": notFound,
    "409": {
      description: "The invoice is not a draft.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
    "400": {
      description: "Seller or buyer details are missing, or the draft has no lines.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
};

export const deleteInvoicePaymentOperation: ZodOpenApiOperationObject = {
  operationId: "deleteInvoicePayment",
  summary: "Delete a payment",
  description:
    "Removes a payment recorded against an issued or paid invoice, for example one entered by mistake. The paid amount is recalculated, and a paid invoice whose payments no longer cover the total goes back to issued.",
  tags: ["invoices"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: DeleteInvoicePaymentSchema },
  requestBody: { required: false, description: "This action takes no request body.", content: {} },
  responses: {
    "200": { description: "The payment was removed.", content: { "application/json": { schema: InvoiceDtoSchema } } },
    "404": {
      description: "No invoice with this ID exists, or the payment does not belong to it.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    "409": {
      description: "The invoice is a draft or void.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};

export const recordInvoicePaymentOperation: ZodOpenApiOperationObject = {
  operationId: "recordInvoicePayment",
  summary: "Record a payment",
  description:
    "Records a payment against an issued invoice. When the payments cover the total, the invoice becomes paid. A payment larger than the open balance is refused.",
  tags: ["invoices"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: InvoiceIdSchema },
  requestBody: {
    required: true,
    content: { "application/json": { schema: RecordInvoicePaymentSchema.omit({ id: true }) } },
  },
  responses: {
    "200": { description: "The payment was recorded.", content: { "application/json": { schema: InvoiceDtoSchema } } },
    "404": notFound,
    "409": {
      description: "The invoice is not issued, or is already paid or void.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
    "400": {
      description: "The payment exceeds the open balance.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
};

export const voidInvoiceOperation: ZodOpenApiOperationObject = {
  operationId: "voidInvoice",
  summary: "Void an invoice",
  description: "Voids an issued, unpaid invoice. It keeps its number, so the sequence has no gaps.",
  tags: ["invoices"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: InvoiceIdSchema },
  requestBody: { required: false, description: "This action takes no request body.", content: {} },
  responses: {
    "200": { description: "The invoice was voided.", content: { "application/json": { schema: InvoiceDtoSchema } } },
    "404": notFound,
    "409": {
      description: "The invoice is not issued, or is already paid or void.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
  },
};
