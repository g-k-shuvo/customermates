import type { ComponentType, ReactNode } from "react";
import type { AppMode } from "@/core/config/environment";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { Passthrough } = vi.hoisted(() => ({
  Passthrough: ({ children }: { children?: ReactNode }) => children ?? null,
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T extends ComponentType<any>>(component: T) => component,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/modal", () => ({ AppModal: Passthrough }));
vi.mock("@/components/card/app-card", () => ({ AppCard: Passthrough }));
vi.mock("@/components/card/app-card-body", () => ({ AppCardBody: Passthrough }));
vi.mock("@/components/card/app-card-header", () => ({ AppCardHeader: Passthrough }));
vi.mock("@/components/card/form-actions", () => ({ FormActions: () => null }));
vi.mock("@/components/forms/form-context", () => ({ AppForm: Passthrough }));
vi.mock("@/components/forms/form-input", () => ({ FormInput: () => null }));
vi.mock("@/components/forms/form-label", () => ({ FormLabel: () => null }));
vi.mock("@/components/forms/form-textarea", () => ({ FormTextarea: () => null }));
vi.mock("@/components/shared/alert", () => ({ Alert: () => null }));
vi.mock("@/components/ui/input", () => ({ Input: () => null }));
vi.mock("@/components/ui/textarea", () => ({ Textarea: () => null }));
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showDeleteConfirmation: vi.fn() }),
}));
vi.mock("@/components/forms/form-radio-group", () => ({
  FormRadioGroup: ({ id }: { id: string }) => createElement("div", { "data-radio-group": id }),
}));

import { RoleModal } from "../role-modal";

function roleStore(appMode: AppMode) {
  return {
    form: {
      name: "Sales",
      description: "Sells things",
      permissions: {
        contacts: { canManage: "no", readAccess: "own" },
        leads: { canManage: "no", readAccess: "own" },
        deals: { canManage: "no", readAccess: "own" },
        pipelines: { canManage: "no", readAccess: "own" },
        organizations: { canManage: "no", readAccess: "own" },
        services: { canManage: "no", readAccess: "own" },
        users: { canManage: "no", readAccess: "own" },
        company: { canManage: "no" },
        api: { canManage: "no", readAccess: "none" },
        tasks: { canManage: "no", readAccess: "own" },
        inboxMessages: { canManage: "no", readAccess: "none" },
        auditLog: { readAccess: "none" },
        routines: { canManage: "no", readAccess: "own" },
        automations: { canManage: "no", readAccess: "own" },
      },
    },
    isDisabledOrSystemRole: false,
    isLoading: false,
    canDeleteRole: false,
    isSystemRole: false,
    isOwnRole: false,
    canManage: true,
    rootStore: { appMode },
  };
}

function renderRoleModal(appMode: AppMode): string {
  return renderToStaticMarkup(createElement(RoleModal, { store: roleStore(appMode) as never }));
}

describe("RoleModal permission rows", () => {
  it("lets a self-hosted admin grant mailbox access, which the self-hosted mail page checks", () => {
    const markup = renderRoleModal("self-hosted");

    expect(markup).toContain("RoleModal.resources.inboxMessages");
    expect(markup).toContain('data-radio-group="permissions.inboxMessages.canManage"');
    expect(markup).toContain('data-radio-group="permissions.inboxMessages.readAccess"');
  });

  it("still hides routines in self-hosted mode, where they are not available", () => {
    const markup = renderRoleModal("self-hosted");

    expect(markup).not.toContain("RoleModal.resources.routines");
    expect(markup).toContain("RoleModal.resources.automations");
  });

  it("offers the mailbox and routine rows in the cloud", () => {
    const markup = renderRoleModal("cloud");

    expect(markup).toContain("RoleModal.resources.inboxMessages");
    expect(markup).toContain("RoleModal.resources.routines");
  });
});
