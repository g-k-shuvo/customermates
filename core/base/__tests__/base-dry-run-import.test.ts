import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { BaseDryRunImportInteractor } from "../base-dry-run-import.interactor";

const RowsSchema = z.object({ contacts: z.array(z.object({ firstName: z.string().min(1), phone: z.string() })) });

class TestDryRun extends BaseDryRunImportInteractor {
  constructor() {
    super("contacts", RowsSchema, RowsSchema, {
      createMany: (data: never, ctx) => {
        const { contacts } = data as z.infer<typeof RowsSchema>;
        contacts.forEach((row, index) => {
          if (!row.phone.startsWith("+"))
            ctx.addIssue({ code: "custom", message: "bad phone", path: ["contacts", index, "phone"] });
        });
      },
      updateMany: () => undefined,
    });
  }
}

describe("BaseDryRunImportInteractor", () => {
  it("reports precheck problems on the other rows when some rows fail the schema", async () => {
    const result = await new TestDryRun().invoke({
      entityType: "contact",
      mode: "create",
      rows: [
        { firstName: "Ok", phone: "+491511" },
        { firstName: "Bad phone", phone: "abc123" },
        { firstName: "", phone: "+491512" },
      ],
    } as never);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        ["contacts", 2, "firstName"],
        ["contacts", 1, "phone"],
      ]),
    );
    expect(result.error.issues).toHaveLength(2);
  });

  it("passes when every row is valid", async () => {
    const result = await new TestDryRun().invoke({
      entityType: "contact",
      mode: "create",
      rows: [{ firstName: "Ok", phone: "+491511" }],
    } as never);

    expect(result).toEqual({ ok: true, data: null });
  });
});
