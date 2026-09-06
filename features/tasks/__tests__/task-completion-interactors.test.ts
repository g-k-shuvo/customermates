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

import { CompleteTaskInteractor } from "../complete/complete-task.interactor";
import { UncompleteTaskInteractor } from "../complete/uncomplete-task.interactor";
import { completeTransition, uncompleteTransition } from "../complete/completion-transition";
import { followUpActivityFrom } from "../complete/follow-up-activity";
import { DomainEvent } from "@/features/event/domain-events";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { ActivityKind } from "@/generated/prisma";

import { TaskWritePrecheckInteractor } from "../upsert/task-write-precheck.interactor";
import { ValidateSystemTaskIdsInteractor } from "../upsert/validate-system-task-ids.interactor";
import { ValidateSystemTaskNameInteractor } from "../upsert/validate-system-task-name.interactor";
import { ValidateAssigneeGuardInteractor } from "@/core/validation/validators/validate-assignee-guard.interactor";
import { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import { ValidateCustomFieldValuesInteractor } from "@/core/validation/validators/validate-custom-field-values.interactor";
import { ValidateDealIdsInteractor } from "@/core/validation/validators/validate-deal-ids.interactor";
import { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import { ValidateServiceIdsInteractor } from "@/core/validation/validators/validate-service-ids.interactor";
import { ValidateTaskIdsInteractor } from "@/core/validation/validators/validate-task-ids.interactor";
import { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import {
  getOrganizationRepo,
  getUserRepo,
  getDealRepo,
  getTaskRepo,
  getContactRepo,
  getServiceRepo,
  getCustomColumnRepo,
  getUserService,
} from "@/core/di";
import type { UserService } from "@/features/user/user.service";

const TASK_ID = "00000000-0000-4000-8000-000000000001";
const FOLLOW_UP_ID = "00000000-0000-4000-8000-000000000002";
const UNKNOWN_TASK_ID = "00000000-0000-4000-8000-0000000000ff";
const CONTACT_ID = "00000000-0000-4000-8000-000000000020";
const DEAL_ID = "00000000-0000-4000-8000-000000000030";
const SERVICE_ID = "00000000-0000-4000-8000-000000000040";
const ORG_ID = "00000000-0000-4000-8000-000000000010";
const USER_ID = "00000000-0000-4000-8000-000000000050";

const COMPLETED_AT = new Date("2026-09-06T12:00:00.000Z");
const FOLLOW_UP_DUE_AT = new Date("2026-09-09T09:00:00.000Z");

type PrecheckOverrides = { taskIds?: Set<string>; systemTaskIds?: Set<string> };

function taskIdRepo({ taskIds, systemTaskIds }: PrecheckOverrides) {
  const base = getTaskRepo();

  return {
    findIds: (ids: Set<string>) => (taskIds ? Promise.resolve(taskIds) : base.findIds(ids)),
    findSystemTaskIds: (ids: Set<string>) =>
      systemTaskIds ? Promise.resolve(systemTaskIds) : base.findSystemTaskIds(ids),
  };
}

function makePrecheck(overrides: PrecheckOverrides = {}): TaskWritePrecheckInteractor {
  const taskRepo = taskIdRepo(overrides);

  return new TaskWritePrecheckInteractor(
    new ValidateOrganizationIdsInteractor(getOrganizationRepo()),
    new ValidateUserIdsInteractor(getUserRepo()),
    new ValidateDealIdsInteractor(getDealRepo()),
    new ValidateTaskIdsInteractor(taskRepo),
    new ValidateContactIdsInteractor(getContactRepo()),
    new ValidateServiceIdsInteractor(getServiceRepo()),
    new ValidateCustomFieldValuesInteractor(getCustomColumnRepo()),
    new ValidateAssigneeGuardInteractor(getUserService() as unknown as UserService),
    new ValidateSystemTaskNameInteractor(taskRepo),
    new ValidateSystemTaskIdsInteractor(taskRepo),
  );
}

function makeTaskDto(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    name: "Call Bob",
    type: "custom",
    notes: null,
    activityKind: ActivityKind.call,
    dueAt: new Date("2026-09-05T09:00:00.000Z"),
    durationMinutes: 30,
    completedAt: null,
    completedById: null,
    isOverdue: true,
    createdAt: new Date("2026-09-01T09:00:00.000Z"),
    updatedAt: new Date("2026-09-01T09:00:00.000Z"),
    users: [{ id: USER_ID, firstName: "Max", lastName: "Bergmann", avatarUrl: null, email: "max@example.com" }],
    contacts: [{ id: CONTACT_ID, firstName: "Bob", lastName: "Builder", avatarUrl: null }],
    organizations: [{ id: ORG_ID, name: "Acme" }],
    deals: [{ id: DEAL_ID, name: "Acme renewal" }],
    services: [{ id: SERVICE_ID, name: "Onboarding", amount: 100 }],
    customFieldValues: [],
    ...overrides,
  };
}

function issueCodes(result: any): CustomErrorCode[] {
  return result.error.issues.map((issue: any) => issue.params?.error);
}

function taskUpdatedCalls(eventService: any) {
  return eventService.publish.mock.calls.filter(([event]: [DomainEvent]) => event === DomainEvent.TASK_UPDATED);
}

describe("completion transition", () => {
  it("stamps the moment and the acting user when completing", () => {
    expect(completeTransition(COMPLETED_AT, USER_ID)).toEqual({ completedAt: COMPLETED_AT, completedById: USER_ID });
  });

  it("clears both columns when reversing", () => {
    expect(uncompleteTransition()).toEqual({ completedAt: null, completedById: null });
  });
});

describe("followUpActivityFrom", () => {
  it("carries every link of the completed activity onto the next one", () => {
    const followUp = followUpActivityFrom(makeTaskDto() as never, {
      name: "Follow up with Bob",
      activityKind: ActivityKind.meeting,
      dueAt: FOLLOW_UP_DUE_AT,
      durationMinutes: 45,
    });

    expect(followUp).toEqual({
      name: "Follow up with Bob",
      notes: null,
      activityKind: ActivityKind.meeting,
      dueAt: FOLLOW_UP_DUE_AT,
      durationMinutes: 45,
      userIds: [USER_ID],
      contactIds: [CONTACT_ID],
      organizationIds: [ORG_ID],
      dealIds: [DEAL_ID],
      serviceIds: [SERVICE_ID],
      customFieldValues: [],
    });
  });
});

describe("CompleteTaskInteractor", () => {
  let mockRepo: any;
  let mockEventService: any;
  let mockFollowUp: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      getOrThrowCompanyWide: vi.fn().mockResolvedValue(makeTaskDto()),
      completeTaskOrThrow: vi
        .fn()
        .mockResolvedValue(makeTaskDto({ completedAt: COMPLETED_AT, completedById: USER_ID, isOverdue: false })),
    };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
    mockFollowUp = {
      invoke: vi.fn().mockResolvedValue({
        ok: true,
        data: makeTaskDto({ id: FOLLOW_UP_ID, name: "Follow up with Bob", dueAt: FOLLOW_UP_DUE_AT, isOverdue: false }),
      }),
    };
  });

  function interactor(overrides: PrecheckOverrides = {}) {
    return new CompleteTaskInteractor(mockRepo, mockEventService, makePrecheck(overrides), mockFollowUp);
  }

  it("completes an incomplete task and answers with the stored task", async () => {
    const result: any = await interactor().invoke({ id: TASK_ID });

    expect(result.ok).toBe(true);
    expect(result.data.task.completedAt).toEqual(COMPLETED_AT);
    expect(result.data.task.completedById).toBe(USER_ID);
    expect(result.data.task.isOverdue).toBe(false);
    expect(result.data.followUpTask).toBeNull();
    expect(mockRepo.completeTaskOrThrow).toHaveBeenCalledWith(TASK_ID);
  });

  it("publishes TASK_UPDATED with the completion changes", async () => {
    await interactor().invoke({ id: TASK_ID });

    const calls = taskUpdatedCalls(mockEventService);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual(
      expect.objectContaining({
        entityId: TASK_ID,
        payload: expect.objectContaining({
          task: expect.objectContaining({ completedAt: COMPLETED_AT }),
          changes: expect.objectContaining({ completedAt: { previous: null, current: COMPLETED_AT } }),
        }),
      }),
    );
  });

  it("reports a conflict when a concurrent request already completed the task", async () => {
    mockRepo.completeTaskOrThrow.mockResolvedValue(null);

    const result: any = await interactor().invoke({ id: TASK_ID });

    expect(result.ok).toBe(false);
    expect(result.error.issues[0].params.error).toBe(CustomErrorCode.taskAlreadyCompleted);
    expect(result.error.issues[0].params.kind).toBe("conflict");
    expect(taskUpdatedCalls(mockEventService)).toHaveLength(0);
  });

  it("refuses a task that is already complete, without writing or publishing", async () => {
    mockRepo.getOrThrowCompanyWide.mockResolvedValue(makeTaskDto({ completedAt: COMPLETED_AT }));

    const result: any = await interactor().invoke({ id: TASK_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.taskAlreadyCompleted);
    expect(mockRepo.completeTaskOrThrow).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalled();
  });

  it("reports an unknown task id as taskNotFound and writes nothing", async () => {
    const result: any = await interactor({ taskIds: new Set<string>() }).invoke({ id: UNKNOWN_TASK_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.taskNotFound);
    expect(mockRepo.completeTaskOrThrow).not.toHaveBeenCalled();
  });

  it("refuses to complete a system task", async () => {
    const result: any = await interactor({ systemTaskIds: new Set([TASK_ID]) }).invoke({ id: TASK_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.taskOnlyCustomTasksCanBeCompleted);
    expect(mockRepo.completeTaskOrThrow).not.toHaveBeenCalled();
  });

  it("schedules the next activity against the same links when asked", async () => {
    const result: any = await interactor().invoke({
      id: TASK_ID,
      followUp: { name: "Follow up with Bob", activityKind: ActivityKind.meeting, dueAt: FOLLOW_UP_DUE_AT },
    });

    expect(result.ok).toBe(true);
    expect(result.data.followUpTask.id).toBe(FOLLOW_UP_ID);
    expect(mockFollowUp.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Follow up with Bob",
        activityKind: ActivityKind.meeting,
        dueAt: FOLLOW_UP_DUE_AT,
        dealIds: [DEAL_ID],
        contactIds: [CONTACT_ID],
      }),
    );
  });

  it("hands back the follow-up's own failure rather than a half-done result", async () => {
    mockFollowUp.invoke.mockResolvedValue({
      ok: false,
      error: { issues: [{ code: "custom", params: { error: CustomErrorCode.dealNotFound } }] },
    });

    const result: any = await interactor().invoke({
      id: TASK_ID,
      followUp: { name: "Follow up with Bob", dueAt: FOLLOW_UP_DUE_AT },
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.dealNotFound);
  });

  it("never asks for a follow-up when none was requested", async () => {
    await interactor().invoke({ id: TASK_ID });

    expect(mockFollowUp.invoke).not.toHaveBeenCalled();
  });
});

describe("UncompleteTaskInteractor", () => {
  let mockRepo: any;
  let mockEventService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      getOrThrowCompanyWide: vi
        .fn()
        .mockResolvedValue(makeTaskDto({ completedAt: COMPLETED_AT, completedById: USER_ID, isOverdue: false })),
      uncompleteTaskOrThrow: vi.fn().mockResolvedValue(makeTaskDto()),
    };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
  });

  function interactor(overrides: PrecheckOverrides = {}) {
    return new UncompleteTaskInteractor(mockRepo, mockEventService, makePrecheck(overrides));
  }

  it("clears both completion columns and answers with the stored task", async () => {
    const result: any = await interactor().invoke({ id: TASK_ID });

    expect(result.ok).toBe(true);
    expect(result.data.completedAt).toBeNull();
    expect(result.data.completedById).toBeNull();
    expect(result.data.isOverdue).toBe(true);
    expect(mockRepo.uncompleteTaskOrThrow).toHaveBeenCalledWith(TASK_ID);
  });

  it("publishes TASK_UPDATED with the reversal changes", async () => {
    await interactor().invoke({ id: TASK_ID });

    const calls = taskUpdatedCalls(mockEventService);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          changes: expect.objectContaining({ completedAt: { previous: COMPLETED_AT, current: null } }),
        }),
      }),
    );
  });

  it("reports a conflict when a concurrent request already reopened the task", async () => {
    mockRepo.uncompleteTaskOrThrow.mockResolvedValue(null);

    const result: any = await interactor().invoke({ id: TASK_ID });

    expect(result.ok).toBe(false);
    expect(result.error.issues[0].params.error).toBe(CustomErrorCode.taskNotCompleted);
    expect(result.error.issues[0].params.kind).toBe("conflict");
    expect(taskUpdatedCalls(mockEventService)).toHaveLength(0);
  });

  it("refuses a task that is not complete, without writing or publishing", async () => {
    mockRepo.getOrThrowCompanyWide.mockResolvedValue(makeTaskDto());

    const result: any = await interactor().invoke({ id: TASK_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.taskNotCompleted);
    expect(mockRepo.uncompleteTaskOrThrow).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalled();
  });

  it("reports an unknown task id as taskNotFound and writes nothing", async () => {
    const result: any = await interactor({ taskIds: new Set<string>() }).invoke({ id: UNKNOWN_TASK_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.taskNotFound);
    expect(mockRepo.uncompleteTaskOrThrow).not.toHaveBeenCalled();
  });
});
