import type { ZodOpenApiOperationObject } from "zod-openapi";

import { UncompleteTaskSchema } from "./uncomplete-task.interactor";
import { TaskDtoSchema } from "../task.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const uncompleteTaskOperation: ZodOpenApiOperationObject = {
  operationId: "uncompleteTask",
  summary: "Reopen a completed task",
  description:
    "Clears completedAt and completedById, returning the task to its incomplete state. A task that is not complete answers 409.",
  tags: ["tasks"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: UncompleteTaskSchema },
  requestBody: {
    required: false,
    description: "This action takes no request body; the task is identified by the path.",
    content: {},
  },
  responses: {
    "200": {
      description: "The task was reopened successfully.",
      content: {
        "application/json": {
          schema: TaskDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
