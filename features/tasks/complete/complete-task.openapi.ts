import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CompleteTaskResultSchema, CompleteTaskSchema } from "./complete-task.interactor";
import { ScheduleFollowUpSchema } from "./follow-up-activity";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const CompleteTaskRequestSchema = z.object({
  followUp: ScheduleFollowUpSchema.nullish(),
});

export const completeTaskOperation: ZodOpenApiOperationObject = {
  operationId: "completeTask",
  summary: "Complete a task",
  description:
    "Marks a task complete, stamping completedAt and completedById with the calling user. A task that is already complete answers 409. Pass followUp to schedule the next activity in the same request: it is created against the same contacts, organizations, deals, services and assignees as the task just completed, and both writes share one transaction.",
  tags: ["tasks"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: CompleteTaskSchema.pick({ id: true }) },
  requestBody: {
    required: false,
    content: {
      "application/json": {
        schema: CompleteTaskRequestSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The task was completed successfully.",
      content: {
        "application/json": {
          schema: CompleteTaskResultSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
