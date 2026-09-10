import { describe, it, expect } from "vitest";

import { BaseCreateTaskSchema } from "../upsert/create-task-base.schema";
import { BaseUpdateTaskSchema } from "../upsert/update-task-base.schema";

const VALID_UUID = "00000000-0000-4000-8000-000000000001";

describe("BaseCreateTaskSchema", () => {
  it("accepts valid minimal data", () => {
    const result = BaseCreateTaskSchema.safeParse({
      name: "Follow up with client",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Follow up with client");
      expect(result.data.userIds).toEqual([]);
      expect(result.data.customFieldValues).toEqual([]);
    }
  });

  it("accepts full data with all optional fields", () => {
    const result = BaseCreateTaskSchema.safeParse({
      name: "Send proposal",
      notes: "Due by Friday",
      userIds: [VALID_UUID],
      customFieldValues: [{ columnId: VALID_UUID, value: "high" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an iso dueAt and coerces it to a Date", () => {
    const result = BaseCreateTaskSchema.safeParse({ name: "Task", dueAt: "2026-05-01T10:00:00.000Z" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dueAt?.toISOString()).toBe("2026-05-01T10:00:00.000Z");
  });

  it("accepts a date-only dueAt and an offset one", () => {
    expect(BaseCreateTaskSchema.safeParse({ name: "Task", dueAt: "2026-05-01" }).success).toBe(true);
    expect(BaseCreateTaskSchema.safeParse({ name: "Task", dueAt: "2026-05-01T10:00:00+02:00" }).success).toBe(true);
  });

  it("still accepts a Date so a re-parsed payload stays valid", () => {
    const once = BaseCreateTaskSchema.parse({ name: "Task", dueAt: "2026-05-01T10:00:00.000Z" });
    const twice = BaseCreateTaskSchema.safeParse(once);
    expect(twice.success).toBe(true);
    if (twice.success) expect(twice.data.dueAt?.toISOString()).toBe("2026-05-01T10:00:00.000Z");
  });

  it("rejects a dueAt that is not iso-8601", () => {
    expect(BaseCreateTaskSchema.safeParse({ name: "Task", dueAt: "tomorrow" }).success).toBe(false);
    expect(BaseCreateTaskSchema.safeParse({ name: "Task", dueAt: 1767225600000 }).success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = BaseCreateTaskSchema.safeParse({
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = BaseCreateTaskSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID in userIds", () => {
    const result = BaseCreateTaskSchema.safeParse({
      name: "Task",
      userIds: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts null notes", () => {
    const result = BaseCreateTaskSchema.safeParse({
      name: "Task",
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty userIds array", () => {
    const result = BaseCreateTaskSchema.safeParse({
      name: "Task",
      userIds: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("BaseUpdateTaskSchema", () => {
  it("accepts valid update with id only", () => {
    const result = BaseUpdateTaskSchema.safeParse({
      id: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial name update", () => {
    const result = BaseUpdateTaskSchema.safeParse({
      id: VALID_UUID,
      name: "Updated task name",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Updated task name");
  });

  it("rejects missing id", () => {
    const result = BaseUpdateTaskSchema.safeParse({
      name: "Updated",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid id", () => {
    const result = BaseUpdateTaskSchema.safeParse({
      id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null for nullable array fields", () => {
    const result = BaseUpdateTaskSchema.safeParse({
      id: VALID_UUID,
      userIds: null,
      customFieldValues: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name when provided", () => {
    const result = BaseUpdateTaskSchema.safeParse({
      id: VALID_UUID,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts notes update", () => {
    const result = BaseUpdateTaskSchema.safeParse({
      id: VALID_UUID,
      notes: "Updated notes content",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an iso dueAt, a null one and a re-parsed Date", () => {
    expect(BaseUpdateTaskSchema.safeParse({ id: VALID_UUID, dueAt: null }).success).toBe(true);

    const once = BaseUpdateTaskSchema.parse({ id: VALID_UUID, dueAt: "2026-05-01T10:00:00.000Z" });
    expect(once.dueAt?.toISOString()).toBe("2026-05-01T10:00:00.000Z");
    expect(BaseUpdateTaskSchema.safeParse(once).success).toBe(true);
  });

  it("rejects a dueAt that is not iso-8601", () => {
    expect(BaseUpdateTaskSchema.safeParse({ id: VALID_UUID, dueAt: "next friday" }).success).toBe(false);
  });
});
