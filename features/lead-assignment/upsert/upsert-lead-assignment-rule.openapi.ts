import type { ZodOpenApiOperationObject } from "zod-openapi";

import {
  LeadAssignmentRuleBodySchema,
  LeadAssignmentRuleDtoSchema,
  LeadAssignmentRuleIdSchema,
} from "../lead-assignment.schema";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

const notFound = {
  "404": {
    description: "No rule with this ID exists.",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

const conflict = {
  "409": {
    description: "A user is not an active member of the workspace, or a condition is not a valid lead filter.",
    content: { "application/json": { schema: ErrorResponseSchema } },
  },
};

export const createLeadAssignmentRuleOperation: ZodOpenApiOperationObject = {
  operationId: "createLeadAssignmentRule",
  summary: "Create a lead assignment rule",
  description:
    "Creates a rule. `position` sets the order rules are tried in (lowest first). A `specificUser` rule takes exactly one user; a `roundRobin` rule takes up to 50 and assigns them in turn, skipping users who are no longer active. Empty `conditions` match every lead.",
  tags: ["lead-assignment"],
  security: [{ apiKeyAuth: [] }],
  requestBody: { required: true, content: { "application/json": { schema: LeadAssignmentRuleBodySchema } } },
  responses: {
    "200": {
      description: "The rule was created.",
      content: { "application/json": { schema: LeadAssignmentRuleDtoSchema } },
    },
    ...CommonApiResponses,
    ...conflict,
  },
};

export const updateLeadAssignmentRuleOperation: ZodOpenApiOperationObject = {
  operationId: "updateLeadAssignmentRule",
  summary: "Update a lead assignment rule",
  description: "Replaces a rule's name, order, conditions, strategy and users, or turns it off.",
  tags: ["lead-assignment"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: LeadAssignmentRuleIdSchema },
  requestBody: { required: true, content: { "application/json": { schema: LeadAssignmentRuleBodySchema } } },
  responses: {
    "200": {
      description: "The rule was updated.",
      content: { "application/json": { schema: LeadAssignmentRuleDtoSchema } },
    },
    ...notFound,
    ...CommonApiResponses,
    ...conflict,
  },
};

export const deleteLeadAssignmentRuleOperation: ZodOpenApiOperationObject = {
  operationId: "deleteLeadAssignmentRule",
  summary: "Delete a lead assignment rule",
  description: "Deletes a rule. Leads it already assigned keep their owner.",
  tags: ["lead-assignment"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: LeadAssignmentRuleIdSchema },
  responses: {
    "200": {
      description: "The rule was deleted and is returned as it was.",
      content: { "application/json": { schema: LeadAssignmentRuleDtoSchema } },
    },
    ...notFound,
    ...CommonApiResponses,
  },
};
