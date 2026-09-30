import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { readAuditChanges } from "../audit-log-changes";

describe("readAuditChanges", () => {
  it("lists each changed field with its previous and current value, leaving out timestamps", () => {
    const changes = readAuditChanges({
      deal: { id: "d1" },
      changes: {
        name: { previous: "Old", current: "New" },
        stageId: { previous: null, current: "s2" },
        updatedAt: { previous: "2026-01-01", current: "2026-01-02" },
      },
    });

    expect(changes).toEqual([
      ["name", { previous: "Old", current: "New" }],
      ["stageId", { previous: null, current: "s2" }],
    ]);
  });

  it("reads the changes an event stores under its payload", () => {
    expect(
      readAuditChanges({
        userId: "u1",
        payload: { deal: { id: "d1" }, changes: { name: { previous: "A", current: "B" } } },
      }),
    ).toEqual([["name", { previous: "A", current: "B" }]]);
  });

  it("answers nothing for events that carry no changes", () => {
    expect(readAuditChanges({ deal: { id: "d1" } })).toEqual([]);
    expect(readAuditChanges(null)).toEqual([]);
    expect(readAuditChanges({ changes: [1, 2] })).toEqual([]);
  });
});
