import type { RootStore } from "@/core/stores/root.store";

import { describe, expect, it, vi } from "vitest";
import { Action, Resource } from "@/generated/prisma";

vi.mock("../../actions", () => ({
  createLeadAction: vi.fn(),
  deleteLeadAction: vi.fn(),
  getLeadByIdAction: vi.fn(),
  updateLeadAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import type { LeadDto } from "@/features/leads/lead.schema";

import { getLeadByIdAction, updateLeadAction } from "../../actions";
import { LeadDetailStore } from "../lead-detail.store";

const USER_ID = "30000000-0000-4000-8000-000000000009";
const LEAD_ID = "30000000-0000-4000-8000-0000000000a1";
const CONTACT_ID = "30000000-0000-4000-8000-0000000000c1";
const ORGANIZATION_ID = "30000000-0000-4000-8000-0000000000d1";

function savedLead(overrides: Partial<LeadDto> = {}): LeadDto {
  return {
    id: LEAD_ID,
    title: "Market assessment",
    status: "new",
    sourceOrigin: "manual",
    labels: [],
    value: null,
    notes: null,
    convertedDealId: null,
    convertedAt: null,
    archivedAt: null,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    updatedAt: new Date("2026-09-01T10:00:00Z"),
    contact: { id: CONTACT_ID, firstName: "Ada", lastName: "Lovelace" },
    organization: { id: ORGANIZATION_ID, name: "Acme" },
    owner: { id: USER_ID, firstName: "Max", lastName: "Bergmann", email: "max@acme.test" },
    source: null,
    customFieldValues: [],
    ...overrides,
  };
}

function rootStore(canReadAllLeads: boolean): RootStore {
  return {
    registerModalStore: vi.fn(),
    leadsStore: {
      customColumns: [],
      setCustomColumns: vi.fn(),
      refreshCustomColumns: vi.fn(),
      upsertItem: vi.fn(),
      removeItem: vi.fn(),
    },
    companyStore: { company: {} },
    userStore: {
      user: { id: USER_ID },
      can: vi.fn((resource: Resource, action: Action) =>
        resource === Resource.leads && action === Action.readAll ? canReadAllLeads : true,
      ),
      canAccess: vi.fn(() => true),
      canManage: vi.fn(() => true),
    },
    loadingOverlayStore: { withLoading: (fn: () => unknown) => fn() },
    globalSearchModalStore: { pushRecentItem: vi.fn(), removeRecentItem: vi.fn() },
    localeStore: { locale: "en", getTranslation: (key: string) => key },
  } as unknown as RootStore;
}

describe("LeadDetailStore new lead form", () => {
  it("makes a caller who only sees their own leads the owner of the lead they start", () => {
    const store = new LeadDetailStore(rootStore(false));

    store.initialize();

    expect(store.form.ownerUserId).toBe(USER_ID);
  });

  it("leaves a new lead unowned for a caller who sees every lead", () => {
    const store = new LeadDetailStore(rootStore(true));

    store.initialize();

    expect(store.form.ownerUserId).toBeUndefined();
  });
});

describe("LeadDetailStore recent items", () => {
  it("records an opened lead in the search's recent items under its title", async () => {
    const root = rootStore(true);
    vi.mocked(getLeadByIdAction).mockResolvedValue({ entity: savedLead(), customColumns: [] } as never);
    const store = new LeadDetailStore(root);

    await store.loadById(LEAD_ID);

    expect(root.globalSearchModalStore.pushRecentItem).toHaveBeenCalledWith({
      type: "lead",
      id: LEAD_ID,
      name: "Market assessment",
      pictureUrl: null,
    });
  });
});

describe("LeadDetailStore relation fields", () => {
  it("starts a new lead with every relation key present, so the pickers react to the first choice", () => {
    const store = new LeadDetailStore(rootStore(true));

    store.initialize();

    expect(Object.keys(store.form)).toEqual(expect.arrayContaining(["contactId", "organizationId", "ownerUserId"]));
  });

  it("sends null when a saved lead's contact, organization or owner is cleared, because an absent key changes nothing", async () => {
    const store = new LeadDetailStore(rootStore(true));
    store.hydrateServerSnapshot(savedLead(), []);
    vi.mocked(updateLeadAction).mockResolvedValue({
      ok: true,
      data: savedLead({ contact: null, organization: null, owner: null }),
    } as never);

    store.onChange("contactId", undefined);
    store.onChange("organizationId", undefined);
    store.onChange("ownerUserId", undefined);
    await store.onSubmit();

    expect(updateLeadAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: LEAD_ID, contactId: null, organizationId: null, ownerUserId: null }),
    );
  });

  it("sends the newly picked contact on a saved lead", () => {
    const store = new LeadDetailStore(rootStore(true));
    store.hydrateServerSnapshot(savedLead({ contact: null }), []);
    const picked = "30000000-0000-4000-8000-0000000000c2";

    store.onChange("contactId", picked);

    expect(store.form.contactId).toBe(picked);
    expect(store.hasUnsavedChanges).toBe(true);
  });

  it("leaves an untouched empty relation absent rather than clearing it on every save", () => {
    const store = new LeadDetailStore(rootStore(true));
    store.hydrateServerSnapshot(savedLead({ contact: null }), []);

    store.onChange("title", "Renamed");

    expect(store.form.contactId).toBeUndefined();
  });

  it("keeps a cleared relation absent on a new lead, where the create schema has no null", () => {
    const store = new LeadDetailStore(rootStore(true));
    store.initialize();

    store.onChange("contactId", CONTACT_ID);
    store.onChange("contactId", undefined);

    expect(store.form.contactId).toBeUndefined();
  });
});
