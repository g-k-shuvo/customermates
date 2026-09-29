import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { LeadAssignmentRuleDtoSchema } from "../lead-assignment.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getLeadAssignmentRulesOperation: ZodOpenApiOperationObject = {
  operationId: "getLeadAssignmentRules",
  summary: "List lead assignment rules",
  description:
    "Lists the rules that give a new lead without an owner its owner, in the order they are tried. The first enabled rule whose conditions the lead matches assigns it: `specificUser` to its one user, `roundRobin` to the next of its users in turn. Conditions use the lead filter language, so a territory is a rule whose conditions name the region fields. Requires permission to read the company settings.",
  tags: ["lead-assignment"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The rules in order.",
      content: { "application/json": { schema: z.array(LeadAssignmentRuleDtoSchema) } },
    },
    ...CommonApiResponses,
  },
};
