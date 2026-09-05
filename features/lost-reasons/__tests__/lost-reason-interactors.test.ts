import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import { GetLostReasonsInteractor } from "../get/get-lost-reasons.interactor";
import { GetLostReasonByIdInteractor } from "../get/get-lost-reason-by-id.interactor";
import { CreateLostReasonInteractor } from "../upsert/create-lost-reason.interactor";
import { UpdateLostReasonInteractor } from "../upsert/update-lost-reason.interactor";
import { DeleteLostReasonInteractor } from "../delete/delete-lost-reason.interactor";
import { ValidateLostReasonIdsInteractor } from "@/core/validation/validators/validate-lost-reason-ids.interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { getLostReasonRepo } from "@/core/di";

const LOST_REASON_ID = "00000000-0000-4000-8000-000000000001";
const UNKNOWN_LOST_REASON_ID = "00000000-0000-4000-8000-000000000002";

function issueCodes(result: any): CustomErrorCode[] {
  return result.error.issues.map((issue: any) => issue.params?.error);
}

function makeLostReasonDto(overrides: Record<string, unknown> = {}) {
  return {
    id: LOST_REASON_ID,
    name: "Price",
    position: 0,
    archivedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function validator() {
  return new ValidateLostReasonIdsInteractor(getLostReasonRepo());
}

function missingIdValidator() {
  return new ValidateLostReasonIdsInteractor({ findIds: () => Promise.resolve(new Set<string>()) });
}

describe("GetLostReasonsInteractor", () => {
  it("returns the reasons the repository holds", async () => {
    const repo = { getLostReasons: vi.fn().mockResolvedValue([makeLostReasonDto()]) };

    const result: any = await new GetLostReasonsInteractor(repo).invoke();

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe("Price");
  });

  it("returns an empty list without failing when the workspace has no reason", async () => {
    const repo = { getLostReasons: vi.fn().mockResolvedValue([]) };

    const result: any = await new GetLostReasonsInteractor(repo).invoke();

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([]);
  });
});

describe("GetLostReasonByIdInteractor", () => {
  it("returns the reason it was asked for", async () => {
    const repo = { getLostReasonById: vi.fn().mockResolvedValue(makeLostReasonDto()) };

    const result: any = await new GetLostReasonByIdInteractor(repo).invoke({ id: LOST_REASON_ID });

    expect(result.ok).toBe(true);
    expect(result.data.id).toBe(LOST_REASON_ID);
    expect(repo.getLostReasonById).toHaveBeenCalledWith(LOST_REASON_ID);
  });

  it("returns null rather than failing when the reason is absent", async () => {
    const repo = { getLostReasonById: vi.fn().mockResolvedValue(null) };

    const result: any = await new GetLostReasonByIdInteractor(repo).invoke({ id: UNKNOWN_LOST_REASON_ID });

    expect(result.ok).toBe(true);
    expect(result.data).toBeNull();
  });

  it("rejects an id that is not a uuid", async () => {
    const repo = { getLostReasonById: vi.fn().mockResolvedValue(null) };

    const result: any = await new GetLostReasonByIdInteractor(repo).invoke({ id: "not-a-uuid" } as never);

    expect(result.ok).toBe(false);
    expect(repo.getLostReasonById).not.toHaveBeenCalled();
  });
});

describe("CreateLostReasonInteractor", () => {
  let mockRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = { createLostReasonOrThrow: vi.fn().mockResolvedValue(makeLostReasonDto()) };
  });

  it("creates a reason at the position it was given", async () => {
    mockRepo.createLostReasonOrThrow.mockResolvedValue(makeLostReasonDto({ position: 3 }));

    const result: any = await new CreateLostReasonInteractor(mockRepo).invoke({ name: "Price", position: 3 });

    expect(result.ok).toBe(true);
    expect(result.data.position).toBe(3);
    expect(mockRepo.createLostReasonOrThrow).toHaveBeenCalledWith({ name: "Price", position: 3 });
  });

  it("defaults the position when the caller omits it", async () => {
    const result: any = await new CreateLostReasonInteractor(mockRepo).invoke({ name: "Price" } as never);

    expect(result.ok).toBe(true);
    expect(mockRepo.createLostReasonOrThrow).toHaveBeenCalledWith({ name: "Price", position: 0 });
  });

  it("refuses a blank name without touching the repository", async () => {
    const result: any = await new CreateLostReasonInteractor(mockRepo).invoke({ name: "   " } as never);

    expect(result.ok).toBe(false);
    expect(mockRepo.createLostReasonOrThrow).not.toHaveBeenCalled();
  });
});

describe("UpdateLostReasonInteractor", () => {
  let mockRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = { updateLostReasonOrThrow: vi.fn().mockResolvedValue(makeLostReasonDto()) };
  });

  it("renames a reason that exists", async () => {
    mockRepo.updateLostReasonOrThrow.mockResolvedValue(makeLostReasonDto({ name: "Too expensive" }));

    const result: any = await new UpdateLostReasonInteractor(mockRepo, validator()).invoke({
      id: LOST_REASON_ID,
      name: "Too expensive",
    });

    expect(result.ok).toBe(true);
    expect(result.data.name).toBe("Too expensive");
  });

  it("archives a reason with the Date the store sends across the action boundary", async () => {
    const archivedAt = new Date("2026-03-01T00:00:00.000Z");
    mockRepo.updateLostReasonOrThrow.mockResolvedValue(makeLostReasonDto({ archivedAt }));

    const result: any = await new UpdateLostReasonInteractor(mockRepo, validator()).invoke({
      id: LOST_REASON_ID,
      archivedAt,
    });

    expect(result.ok).toBe(true);
    expect(mockRepo.updateLostReasonOrThrow).toHaveBeenCalledWith({ id: LOST_REASON_ID, archivedAt });
    expect(result.data.archivedAt).toEqual(archivedAt);
  });

  it("restores a reason when archivedAt is cleared", async () => {
    const result: any = await new UpdateLostReasonInteractor(mockRepo, validator()).invoke({
      id: LOST_REASON_ID,
      archivedAt: null,
    });

    expect(result.ok).toBe(true);
    expect(mockRepo.updateLostReasonOrThrow).toHaveBeenCalledWith({ id: LOST_REASON_ID, archivedAt: null });
  });

  it("reports an unknown id as lostReasonNotFound and writes nothing", async () => {
    const result: any = await new UpdateLostReasonInteractor(mockRepo, missingIdValidator()).invoke({
      id: UNKNOWN_LOST_REASON_ID,
      name: "Price",
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.lostReasonNotFound);
    expect(mockRepo.updateLostReasonOrThrow).not.toHaveBeenCalled();
  });
});

describe("DeleteLostReasonInteractor", () => {
  let mockRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      deleteLostReasonOrThrow: vi.fn().mockResolvedValue(makeLostReasonDto()),
      countDealsWithLostReason: vi.fn().mockResolvedValue(0),
    };
  });

  it("deletes the reason and answers with its id", async () => {
    const result: any = await new DeleteLostReasonInteractor(mockRepo, validator()).invoke({ id: LOST_REASON_ID });

    expect(result.ok).toBe(true);
    expect(result.data).toBe(LOST_REASON_ID);
    expect(mockRepo.deleteLostReasonOrThrow).toHaveBeenCalledWith(LOST_REASON_ID);
  });

  it("refuses to delete a reason still set on closed deals and reports the count", async () => {
    mockRepo.countDealsWithLostReason.mockResolvedValue(4);

    const result: any = await new DeleteLostReasonInteractor(mockRepo, validator()).invoke({ id: LOST_REASON_ID });

    expect(result.ok).toBe(false);
    expect(result.error.issues[0].params.error).toBe(CustomErrorCode.lostReasonHasDeals);
    expect(result.error.issues[0].params.count).toBe(4);
    expect(mockRepo.deleteLostReasonOrThrow).not.toHaveBeenCalled();
  });

  it("reports an unknown id as lostReasonNotFound and deletes nothing", async () => {
    const result: any = await new DeleteLostReasonInteractor(mockRepo, missingIdValidator()).invoke({
      id: UNKNOWN_LOST_REASON_ID,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.lostReasonNotFound);
    expect(mockRepo.deleteLostReasonOrThrow).not.toHaveBeenCalled();
  });
});
