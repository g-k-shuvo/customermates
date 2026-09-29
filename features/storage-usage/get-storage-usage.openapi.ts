import type { ZodOpenApiOperationObject } from "zod-openapi";

import { StorageUsageDtoSchema } from "./get-storage-usage.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getStorageUsageOperation: ZodOpenApiOperationObject = {
  operationId: "getStorageUsage",
  summary: "Get storage usage",
  description:
    "Returns how many bytes the workspace stores in record files, documents and email attachments, and its quota. With a quota set, an upload that would exceed it is refused with `storageQuotaExceeded` and new email attachments are not stored. Requires permission to read the company settings.",
  tags: ["storage"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": { description: "The storage usage.", content: { "application/json": { schema: StorageUsageDtoSchema } } },
    ...CommonApiResponses,
  },
};
