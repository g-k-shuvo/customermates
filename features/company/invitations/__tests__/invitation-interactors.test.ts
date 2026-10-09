import { describe, expect, it, vi } from "vitest";

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

import { ResendInvitationInteractor } from "../resend-invitation.interactor";
import { RevokeInvitationInteractor } from "../revoke-invitation.interactor";

const INVITATION_ID = "40000000-0000-4000-8000-000000000001";

function makeRepo(found: boolean) {
  return {
    findEmailInvitation: vi.fn().mockResolvedValue(found ? { id: INVITATION_ID, email: "ann@example.com" } : null),
    deleteEmailInvitation: vi.fn().mockResolvedValue(undefined),
  };
}

describe("ResendInvitationInteractor", () => {
  it("sends the invitation again to the invited address", async () => {
    const repo = makeRepo(true);
    const invite = { invoke: vi.fn().mockResolvedValue({ ok: true, data: { sent: 1 } }) };

    const result = await new ResendInvitationInteractor(repo, invite as never).invoke({ id: INVITATION_ID });

    expect(result).toEqual({ ok: true, data: INVITATION_ID });
    expect(invite.invoke).toHaveBeenCalledWith({ emails: ["ann@example.com"] });
  });

  it("reports an invitation that no longer exists as not found", async () => {
    const invite = { invoke: vi.fn() };

    const result = await new ResendInvitationInteractor(makeRepo(false), invite as never).invoke({ id: INVITATION_ID });

    expect(result).toMatchObject({ ok: false });
    expect(invite.invoke).not.toHaveBeenCalled();
  });
});

describe("RevokeInvitationInteractor", () => {
  it("removes the invitation link", async () => {
    const repo = makeRepo(true);

    const result = await new RevokeInvitationInteractor(repo).invoke({ id: INVITATION_ID });

    expect(result).toEqual({ ok: true, data: INVITATION_ID });
    expect(repo.deleteEmailInvitation).toHaveBeenCalledWith(INVITATION_ID);
  });

  it("reports an invitation that no longer exists as not found", async () => {
    const repo = makeRepo(false);

    const result = await new RevokeInvitationInteractor(repo).invoke({ id: INVITATION_ID });

    expect(result.ok).toBe(false);
    expect(repo.deleteEmailInvitation).not.toHaveBeenCalled();
  });
});
