import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { GetInvoiceDocumentSchema } from "./get-invoice-document.interactor";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

const path = GetInvoiceDocumentSchema.pick({ id: true });
const query = GetInvoiceDocumentSchema.pick({ locale: true });
const binary = z.string().meta({ format: "binary" });
const notFound = {
  description: "No invoice with this ID exists.",
  content: { "application/json": { schema: ErrorResponseSchema } },
};

export const getInvoicePdfOperation: ZodOpenApiOperationObject = {
  operationId: "getInvoicePdf",
  summary: "Download an invoice as PDF",
  description:
    "Renders the invoice as an A4 PDF in the language given by `locale` (the caller's display language by default), with the seller details it was issued with. A draft is marked as a draft and a voided invoice as void.",
  tags: ["invoices"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path, query },
  responses: {
    "200": { description: "The PDF.", content: { "application/pdf": { schema: binary } } },
    "404": notFound,
    ...CommonApiResponses,
  },
};

export const getInvoiceXRechnungOperation: ZodOpenApiOperationObject = {
  operationId: "getInvoiceXRechnung",
  summary: "Download an invoice as XRechnung",
  description:
    "Returns an issued or paid invoice as XRechnung 3.0 (UBL 2.1, EN 16931). The seller needs a billing email, phone, VAT ID and a postal address with postcode and city in the invoicing settings, and the invoice's recipient a billing email and such an address; otherwise the request is refused. VAT is category S for a positive rate and Z for 0 %.",
  tags: ["invoices"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path, query },
  responses: {
    "200": { description: "The XRechnung XML.", content: { "application/xml": { schema: binary } } },
    "404": notFound,
    "409": {
      description: "The invoice is a draft or void.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    ...CommonApiResponses,
    "400": {
      description: "Details XRechnung requires are missing.",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
};
