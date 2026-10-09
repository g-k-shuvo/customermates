import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  hasPermission: vi.fn(),
  sourcesInvoke: vi.fn(),
  submissionsInvoke: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/auth/next/require", () => ({ requireAccess: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/core/data-view/next/read-surface-params", () => ({ readSurfaceParams: vi.fn().mockResolvedValue({}) }));
vi.mock("@/core/di", () => ({
  getUserService: () => ({ hasPermission: mocks.hasPermission }),
  getGetWebFormSourcesInteractor: () => ({ invoke: mocks.sourcesInvoke }),
  getGetWebFormSubmissionsInteractor: () => ({ invoke: mocks.submissionsInvoke }),
}));
vi.mock("@/components/shared/page-container", () => ({ PageContainer: () => null }));
vi.mock("../../components/webform/web-form-sources-page-view", () => ({ WebFormSourcesPageView: () => null }));
vi.mock("../../components/webform/web-form-submissions-page-view", () => ({
  WebFormSubmissionsPageView: () => null,
}));

import { Action, Resource } from "@/generated/prisma";

import CompanyWebFormsPage from "../page";
import CompanyWebFormSubmissionsPage from "../submissions/page";

const searchParams = Promise.resolve({});

describe.each([
  ["sources", CompanyWebFormsPage, mocks.sourcesInvoke],
  ["submissions", CompanyWebFormSubmissionsPage, mocks.submissionsInvoke],
])("web form %s page", (_name, Page, invoke) => {
  beforeEach(() => vi.clearAllMocks());

  it("sends a role that reads only its own leads to the dashboard instead of failing", async () => {
    mocks.hasPermission.mockResolvedValue(false);

    await expect(Page({ searchParams })).rejects.toThrow("redirect:/dashboard");

    expect(mocks.hasPermission).toHaveBeenCalledWith(Resource.leads, Action.readAll);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("loads the page for a role that reads all leads", async () => {
    mocks.hasPermission.mockResolvedValue(true);
    invoke.mockResolvedValue({ ok: true, data: { items: [] } });

    await expect(Page({ searchParams })).resolves.toBeTruthy();

    expect(invoke).toHaveBeenCalledOnce();
  });
});
