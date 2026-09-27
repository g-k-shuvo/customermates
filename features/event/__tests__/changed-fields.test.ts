import { describe, expect, it } from "vitest";

import { fieldChangesIn } from "../changed-fields";

const change = { previous: "Before", current: "After" };

describe("fieldChangesIn", () => {
  it("reports no change record for a created or deleted event, which carries a snapshot", () => {
    expect(fieldChangesIn({ entityId: "d1", payload: { id: "d1", name: "Acme" } })).toBeNull();
  });

  it("reports no change record when the event has no payload object", () => {
    expect(fieldChangesIn(undefined)).toBeNull();
    expect(fieldChangesIn({ entityId: "d1" })).toBeNull();
    expect(fieldChangesIn({ payload: "changes" })).toBeNull();
  });

  it("names every field an update changed, in the order the audit trail shows them", () => {
    expect(fieldChangesIn({ payload: { deal: { id: "d1" }, changes: { users: change, name: change } } })).toEqual([
      "name",
      "users",
    ]);
  });

  it("leaves out the bookkeeping fields the audit trail ignores", () => {
    const changes = { updatedAt: change, ownerUserId: change, status: change };

    expect(fieldChangesIn({ payload: { changes } })).toEqual(["status"]);
  });

  it("names a changed custom field by its column id", () => {
    const changes = {
      customFieldValues: {
        previous: [{ columnId: "column-a", value: "1" }],
        current: [
          { columnId: "column-a", value: "2" },
          { columnId: "column-b", value: "3" },
        ],
      },
    };

    expect(fieldChangesIn({ payload: { changes } })).toEqual(["column-a", "column-b"]);
  });

  it("treats an empty or missing change record as an update that changed nothing it can name", () => {
    expect(fieldChangesIn({ payload: { changes: {} } })).toEqual([]);
    expect(fieldChangesIn({ payload: { changes: null } })).toEqual([]);
  });
});
