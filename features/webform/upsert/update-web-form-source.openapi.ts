import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { WebFormSourceDtoSchema } from "../webform-source.schema";

import { UpdateWebFormSourceSchema } from "./update-web-form-source.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateWebFormSourceOperation: ZodOpenApiOperationObject = {
  operationId: "updateWebFormSource",
  summary: "Update a web form source",
  description:
    "Changes a source's name, active flag, default owner, default labels or field mapping. The slug is immutable, because it is the public endpoint path a live form already posts to; create a new source instead of renaming one.",
  tags: ["webform-sources"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: UpdateWebFormSourceSchema.omit({ id: true }),
      },
    },
  },
  responses: {
    "200": {
      description: "The source was updated successfully.",
      content: {
        "application/json": {
          schema: WebFormSourceDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
