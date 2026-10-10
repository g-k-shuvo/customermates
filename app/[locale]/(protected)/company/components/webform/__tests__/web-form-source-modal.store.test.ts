import type { RootStore } from "@/core/stores/root.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { autorun } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

const actions = vi.hoisted(() => ({
  createWebFormSourceAction: vi.fn(),
  deleteWebFormSourceAction: vi.fn(),
  rotateWebFormSecretAction: vi.fn(),
  updateWebFormSourceAction: vi.fn(),
}));
const getCustomColumnsByEntityTypeAction = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("../../../actions", () => actions);
vi.mock("@/app/actions", () => ({ getCustomColumnsByEntityTypeAction }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

import { adoptLegacyPhoneMapping, WebFormSourceModalStore } from "../web-form-source-modal.store";

const phoneColumn = (id: string) =>
  ({
    id,
    label: "Phones",
    type: CustomColumnType.phone,
    entityType: EntityType.contact,
    options: {},
  }) as unknown as CustomColumnDto;
const plainColumn = {
  id: "plain-1",
  label: "UTM",
  type: CustomColumnType.plain,
  entityType: EntityType.lead,
  options: {},
} as unknown as CustomColumnDto;

function rootStore() {
  return {
    registerModalStore: vi.fn(),
    webFormSourcesStore: { refresh: vi.fn(() => Promise.resolve()) },
    localeStore: { getTranslation: (key: string) => key },
    userStore: { user: { id: "user" }, canManage: () => true, canAccess: () => true, can: () => true },
  } as unknown as RootStore;
}

describe("adoptLegacyPhoneMapping", () => {
  it("moves a legacy phone path into an extra field, preselecting the only phone field", () => {
    expect(
      adoptLegacyPhoneMapping({ email: "fields.email", phone: "fields.phone" }, [plainColumn, phoneColumn("p1")]),
    ).toEqual({
      email: "fields.email",
      customFields: [{ path: "fields.phone", columnId: "p1" }],
    });
  });

  it("leaves the field to choose when there is no single phone field, and never duplicates a row", () => {
    expect(adoptLegacyPhoneMapping({ phone: "fields.phone" }, [phoneColumn("p1"), phoneColumn("p2")])).toEqual({
      customFields: [{ path: "fields.phone", columnId: "" }],
    });
    expect(
      adoptLegacyPhoneMapping({ phone: "fields.phone", customFields: [{ path: "fields.phone", columnId: "p1" }] }, []),
    ).toEqual({ customFields: [{ path: "fields.phone", columnId: "p1" }] });
    expect(adoptLegacyPhoneMapping({ email: "fields.email" }, [phoneColumn("p1")])).toEqual({ email: "fields.email" });
  });
});

describe("WebFormSourceModalStore extra fields", () => {
  beforeEach(() => {
    for (const action of Object.values(actions)) action.mockReset();
    getCustomColumnsByEntityTypeAction.mockReset();
    toastError.mockReset();
  });

  it("loads lead and contact columns when opened, and adopts a legacy phone mapping as an unsaved change so it can be stored", async () => {
    getCustomColumnsByEntityTypeAction.mockImplementation(({ entityType }: { entityType: EntityType }) =>
      Promise.resolve(entityType === EntityType.lead ? [plainColumn] : [phoneColumn("p1")]),
    );
    const store = new WebFormSourceModalStore(rootStore());

    store.openForSource({
      id: "source-1",
      name: "Footer",
      slug: "footer",
      active: true,
      defaultLabels: [],
      fieldMapping: { phone: "fields.phone" },
    } as never);
    await vi.waitFor(() => expect(store.mappableColumns).toHaveLength(2));

    expect(store.form.fieldMapping).toEqual({ customFields: [{ path: "fields.phone", columnId: "p1" }] });
    expect(store.hasUnsavedChanges).toBe(true);
  });

  it("keeps a mapping path reactive even when the saved source never had it", () => {
    getCustomColumnsByEntityTypeAction.mockResolvedValue([]);
    const store = new WebFormSourceModalStore(rootStore());
    store.openForSource({
      id: "source-1",
      name: "Footer",
      slug: "footer",
      active: true,
      defaultLabels: [],
      fieldMapping: { email: "fields.email" },
    } as never);

    const seen: unknown[] = [];
    const stop = autorun(() => seen.push(store.getValue("fieldMapping.value")));
    store.onChange("fieldMapping.value", "fields.budget");
    stop();

    expect(seen).toEqual([undefined, "fields.budget"]);
  });

  it("drops blank rows, refuses a half-filled row, and never sends the legacy phone key", async () => {
    getCustomColumnsByEntityTypeAction.mockResolvedValue([]);
    actions.createWebFormSourceAction.mockResolvedValue({ ok: true, data: { id: "source-2", signingSecret: "s" } });
    const store = new WebFormSourceModalStore(rootStore());
    store.openForCreate();
    store.onChange("name", "Assessment");
    store.onChange("slug", "assessment");
    store.addCustomField();
    store.addCustomField();
    store.onChange("fieldMapping.customFields[1].path", "fields.utm");

    await store.onSubmit();
    expect(toastError).toHaveBeenCalledWith("WebFormSourceModal.customFieldIncomplete", expect.anything());
    expect(actions.createWebFormSourceAction).not.toHaveBeenCalled();

    store.onChange("fieldMapping.customFields[1].columnId", "plain-1");
    store.onChange("fieldMapping.phone", "fields.phone");
    await store.onSubmit();

    expect(actions.createWebFormSourceAction).toHaveBeenCalledWith(
      expect.objectContaining({ fieldMapping: { customFields: [{ path: "fields.utm", columnId: "plain-1" }] } }),
    );
  });
});
