import type { NextRequest } from "next/server";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/core/errors/app-errors";
import { createZodError } from "@/core/validation/validation.utils";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/core/di", () => ({
  getGetDealStageDurationsInteractor: () => ({ invoke }),
}));

import { GET } from "../route";

const DEAL_ID = "70000000-0000-4000-8000-000000000001";
const STAGE_ID = "70000000-0000-4000-8000-000000000002";

function call(id = DEAL_ID) {
  const request = new Request(`http://localhost/api/v1/deals/${id}/stage-history`) as unknown as NextRequest;

  return GET(request, { params: Promise.resolve({ id }) });
}

describe("deal stage history route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the deal's time in each stage", async () => {
    invoke.mockResolvedValue({
      ok: true,
      data: {
        dealId: DEAL_ID,
        pipelineId: null,
        currentStageId: STAGE_ID,
        measuredAt: new Date("2026-03-10T12:00:00.000Z"),
        stages: [
          {
            stageId: STAGE_ID,
            name: "Qualified",
            position: 0,
            kind: "open",
            durationSeconds: 60,
            visits: 1,
            isCurrent: true,
            lastEnteredAt: new Date("2026-03-10T11:59:00.000Z"),
          },
        ],
      },
    });

    const response = await call();

    expect(response.status).toBe(200);
    expect(invoke).toHaveBeenCalledExactlyOnceWith({ id: DEAL_ID });
    expect(await response.json()).toMatchObject({
      dealId: DEAL_ID,
      measuredAt: "2026-03-10T12:00:00.000Z",
      stages: [{ stageId: STAGE_ID, durationSeconds: 60, lastEnteredAt: "2026-03-10T11:59:00.000Z" }],
    });
  });

  it("answers 404 for a deal the caller cannot see", async () => {
    invoke.mockResolvedValue({
      ok: false,
      error: createZodError("Deal ID not found or not accessible.", ["id"], {
        error: "dealNotFound",
        kind: "not_found",
      }),
    });

    const response = await call();

    expect(response.status).toBe(404);
    expect(await response.json()).toContain("Deal ID not found or not accessible.");
  });

  it("answers 400 for an id that is not valid", async () => {
    invoke.mockResolvedValue({ ok: false, error: createZodError("Invalid UUID", ["id"]) });

    const response = await call("not-a-uuid");

    expect(response.status).toBe(400);
  });

  it("answers 403 when the caller may not read deals", async () => {
    invoke.mockRejectedValue(new ForbiddenError());

    const response = await call();

    expect(response.status).toBe(403);
  });
});
