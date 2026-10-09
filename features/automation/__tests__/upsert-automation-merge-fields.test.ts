import { describe, expect, it } from "vitest";

import { AutomationActionKind, AutomationTriggerKind, EntityType } from "@/generated/prisma";

import { UpsertAutomationSchema } from "../upsert/upsert-automation.interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";

function emailAutomation(subject: string, body: string) {
  return {
    name: "Deal email",
    triggerKind: AutomationTriggerKind.recordCreated,
    entityType: EntityType.deal,
    steps: [
      {
        kind: AutomationActionKind.sendEmail,
        config: { recipient: { kind: "address", address: "max@vendor.example" }, subject, body },
      },
    ],
  };
}

function mergeIssues(input: unknown) {
  const result = UpsertAutomationSchema.safeParse(input);
  if (result.success) return [];

  return result.error.issues
    .filter((issue) => issue.code === "custom")
    .map((issue) => ({ path: issue.path, params: (issue as { params?: Record<string, unknown> }).params }));
}

describe("UpsertAutomationSchema merge fields", () => {
  it("accepts the offered merge fields with and without a fallback", () => {
    expect(mergeIssues(emailAutomation("New deal {{deal.name}}", 'Hi {{contact.firstName | "there"}}'))).toEqual([]);
  });

  it("refuses an unknown merge field on the field that holds it", () => {
    expect(mergeIssues(emailAutomation("New deal {{deal.bogus}}", "Hello"))).toEqual([
      {
        path: ["steps", 0, "config", "subject"],
        params: { error: CustomErrorCode.mergeFieldUnknown, field: "deal.bogus" },
      },
    ]);
  });

  it("refuses a field the renderer keeps out of email", () => {
    expect(mergeIssues(emailAutomation("Deal", "Notes: {{deal.notes}}"))).toEqual([
      {
        path: ["steps", 0, "config", "body"],
        params: { error: CustomErrorCode.mergeFieldUnknown, field: "deal.notes" },
      },
    ]);
  });

  it("refuses a placeholder that is not closed", () => {
    expect(mergeIssues(emailAutomation("Deal {{ deal.name", "Hello"))).toEqual([
      {
        path: ["steps", 0, "config", "subject"],
        params: { error: CustomErrorCode.mergeFieldMalformed, field: "{{" },
      },
    ]);
  });
});
