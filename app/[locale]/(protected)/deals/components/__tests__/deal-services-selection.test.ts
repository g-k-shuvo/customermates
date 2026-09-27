import type { ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const personalization = vi.hoisted(() => ({
  applyFieldVisibility: true,
  enabled: true,
  hiddenFieldIds: [] as string[],
  isPersonalizing: false,
  starredFieldIds: [] as string[],
  toggleStarredField: vi.fn(),
}));

const dealDetailStore = vi.hoisted(() => ({
  form: { baseValue: 0 as number | undefined, services: [] as Array<{ quantity?: number; serviceId?: string }> },
  fetchedEntity: { id: "deal-1", services: [] as Array<{ id: string }> },
  canManage: true,
  addService: vi.fn(),
  deleteService: vi.fn(),
  serviceAmountById: new Map<string, number>(),
  totalQuantity: 0,
  totalValue: 0,
  servicesValue: 0,
  weightedValueBreakdown: null as {
    percent: number;
    stage: string;
    weightedValue: number;
  } | null,
  searchServiceOptions: vi.fn(),
  createServiceOption: vi.fn(),
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T extends ComponentType<any>>(component: T) => component,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: { entity?: string; field?: string }) =>
    ({
      "Common.actions.delete": "Delete",
      "Common.actions.openList": "Open list",
      "Common.inputs.addService": "Add service",
      "DealModal.noServicesAdded": `No ${values?.entity ?? "services"} added`,
      "DealModal.quantityLabel": "Quantity",
      "DealModal.valueLabel": "Value",
      "Common.ariaLabels.explainField": `About ${values?.field ?? "field"}`,
      "EntityDetail.pinField": `Pin ${values?.field ?? "Services"} to the overview`,
      "EntityDetail.unpinField": `Unpin ${values?.field ?? "Services"} from the overview`,
    })[key] ?? key,
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Tooltip: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  TooltipTrigger: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  TooltipContent: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));

vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children),
}));

vi.mock("@/components/entity-detail/entity-detail-personalization", () => ({
  useEntityDetailPersonalization: () => personalization,
}));

vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  useEntityHref: () => vi.fn(),
  useNavigateToHref: () => vi.fn(),
}));

vi.mock("@/components/entity-terminology/use-column-label", () => ({
  useColumnLabel: () => (field: string) => field,
}));

vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({
    plural: (entityType: string) => `${entityType[0].toUpperCase()}${entityType.slice(1)}s`,
    singular: (entityType: string) => `${entityType[0].toUpperCase()}${entityType.slice(1)}`,
  }),
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    dealDetailStore,
    userStore: { canAccess: () => true },
  }),
}));

vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatCurrency: (value: number) => `€${value}`,
    formatNumber: (value: number) => String(value),
  }),
}));

import { DealServicesSelection } from "../deal-services-selection";

describe("DealServicesSelection relation actions", () => {
  beforeEach(() => {
    dealDetailStore.canManage = true;
    dealDetailStore.form.services = [];
    dealDetailStore.form.baseValue = 0;
    dealDetailStore.totalQuantity = 0;
    dealDetailStore.totalValue = 0;
    dealDetailStore.servicesValue = 0;
    dealDetailStore.weightedValueBreakdown = null;
    personalization.hiddenFieldIds = [];
  });

  it("renders pin and go-to actions together on the page detail row", () => {
    const markup = renderToStaticMarkup(
      createElement(DealServicesSelection, {
        personalization: { fieldId: "serviceIds", label: "Services" },
        showTotals: false,
      }),
    );

    expect(markup).toContain('aria-label="Pin Services to the overview"');
    expect(markup).toContain('aria-label="Open list"');
    expect(markup).toContain('href="/services?filters=dealIds%3Ain%3Adeal-1"');
  });

  it("keeps the go-to action in the drawer without exposing personalization", () => {
    const markup = renderToStaticMarkup(createElement(DealServicesSelection));

    expect(markup).not.toContain("overview");
    expect(markup).toContain('aria-label="Open list"');
    expect(markup).toContain('aria-label="About Value"');
  });

  it("keeps line-value and weighted-value help without repeating help icons beside sums", () => {
    dealDetailStore.form.services = [{ quantity: 2, serviceId: "service-1" }];
    dealDetailStore.totalQuantity = 2;
    dealDetailStore.totalValue = 400;
    dealDetailStore.servicesValue = 400;
    dealDetailStore.weightedValueBreakdown = {
      percent: 50,
      stage: "Qualified",
      weightedValue: 200,
    };

    const markup = renderToStaticMarkup(createElement(DealServicesSelection));

    expect(markup).toContain('aria-label="About Value"');
    expect(markup).not.toContain('aria-label="About totalValue"');
    expect(markup).toContain('aria-label="About weightedValue"');
    expect(markup).not.toContain('aria-label="About totalQuantity"');
    expect(markup).toContain("EntityDetail.computedFieldHelp.serviceLineValue");
    expect(markup).toContain("EntityDetail.computedFieldHelp.weightedValue");
  });

  it("aligns quantity and value totals beside the add-service control", () => {
    dealDetailStore.form.services = [{ quantity: 2, serviceId: "service-1" }];
    dealDetailStore.totalQuantity = 2;
    dealDetailStore.totalValue = 400;
    dealDetailStore.servicesValue = 400;

    const markup = renderToStaticMarkup(
      createElement(DealServicesSelection, {
        personalization: { fieldId: "serviceIds", label: "Services" },
        showWeightedValue: false,
      }),
    );

    expect(markup).toContain("grid-cols-[minmax(0,1fr)_5.5rem_minmax(4.5rem,8rem)_2.5rem]");
    expect(markup).toContain('data-deal-service-total="quantity"');
    expect(markup).toContain('aria-label="totalQuantity: 2"');
    expect(markup).toContain('data-deal-service-total="value"');
    expect(markup).toContain('aria-label="Value: €400"');
    expect(markup.indexOf("Add service")).toBeLessThan(markup.indexOf('data-deal-service-total="quantity"'));
    expect(markup).not.toContain('data-entity-field="weightedValue"');
  });

  it.each([true, false])("keeps plain monospace sums aligned and accessible with canManage=%s", (canManage) => {
    dealDetailStore.canManage = canManage;
    dealDetailStore.form.services = [{ quantity: 1050, serviceId: "service-1" }];
    dealDetailStore.totalQuantity = 1050;
    dealDetailStore.totalValue = 342000;
    dealDetailStore.servicesValue = 342000;

    const markup = renderToStaticMarkup(createElement(DealServicesSelection));
    const outputs = [...markup.matchAll(/<output\b[^>]*>[\s\S]*?<\/output>/g)].map(([output]) => output);

    expect(outputs).toHaveLength(2);
    for (const output of outputs) {
      expect(output).toContain("font-mono font-normal tabular-nums");
      expect(output).toContain('aria-hidden="true"');
      expect(output).toContain("lucide-sigma");
      expect(output.indexOf("lucide-sigma")).toBeLessThan(output.indexOf('<span class="truncate">'));
      expect(output).not.toContain("<button");
      expect(output).not.toMatch(/border-t\b|font-semibold|font-bold/);
    }
    expect(outputs[0]).toContain("border border-transparent pr-3 text-base");
    expect(outputs[0]).toContain("md:text-sm");
    expect(outputs[0]).toContain('aria-label="totalQuantity: 1050"');
    expect(outputs[1]).toContain("text-base");
    expect(outputs[1]).toContain("md:text-sm");
    expect(outputs[1]).toContain('aria-label="Value: €342000"');
    expect(markup).toContain(
      'class="flex min-w-0 text-base text-right font-mono tabular-nums text-foreground/80 md:text-sm"',
    );
    expect(markup.includes("Add service")).toBe(canManage);
  });

  it("does not show sums without service rows or when totals are disabled", () => {
    expect(renderToStaticMarkup(createElement(DealServicesSelection))).not.toContain("<output");
    dealDetailStore.form.services = [{ quantity: 0, serviceId: "service-1" }];
    expect(renderToStaticMarkup(createElement(DealServicesSelection, { showTotals: false }))).not.toContain("<output");
    const markup = renderToStaticMarkup(createElement(DealServicesSelection));
    expect(markup).toContain('aria-label="totalQuantity: 0"');
    expect(markup).toContain('aria-label="Value: €0"');
  });

  it("keeps contextual service totals visible when their standalone fields are hidden", () => {
    dealDetailStore.form.services = [{ quantity: 2, serviceId: "service-1" }];
    dealDetailStore.totalQuantity = 2;
    dealDetailStore.totalValue = 400;
    dealDetailStore.servicesValue = 400;
    dealDetailStore.weightedValueBreakdown = {
      percent: 50,
      stage: "Qualified",
      weightedValue: 200,
    };

    for (const hiddenFieldId of ["totalValue", "totalQuantity", "weightedValue"]) {
      personalization.hiddenFieldIds = [hiddenFieldId];
      const markup = renderToStaticMarkup(createElement(DealServicesSelection));

      expect(markup).toContain('data-entity-field="serviceIds"');
      expect(markup).toContain('data-deal-service-total="quantity"');
      expect(markup).toContain('data-deal-service-total="value"');
      expect(markup.includes('data-entity-field="weightedValue"')).toBe(hiddenFieldId !== "weightedValue");
    }
  });

  it("sums only the service lines and shows the deal value beside them when the deal has a base value", () => {
    dealDetailStore.form.baseValue = 2500;
    dealDetailStore.form.services = [{ quantity: 1, serviceId: "service-1" }];
    dealDetailStore.totalQuantity = 1;
    dealDetailStore.totalValue = 2620;
    dealDetailStore.servicesValue = 120;

    const drawer = renderToStaticMarkup(createElement(DealServicesSelection));
    expect(drawer).toContain('aria-label="Value: €120"');
    expect(drawer).toContain('data-entity-field="totalValue"');
    expect(drawer).toContain("€2620");
    expect(drawer).toContain("EntityDetail.computedFieldHelp.dealValue");

    const page = renderToStaticMarkup(createElement(DealServicesSelection, { showWeightedValue: false }));
    expect(page).toContain('aria-label="Value: €120"');
    expect(page).not.toContain('data-entity-field="totalValue"');
  });

  it("shows the deal value and weighted value of a deal that has a base value but no services", () => {
    dealDetailStore.form.baseValue = 50000;
    dealDetailStore.totalValue = 50000;
    dealDetailStore.weightedValueBreakdown = { percent: 40, stage: "Qualified", weightedValue: 20000 };

    const markup = renderToStaticMarkup(createElement(DealServicesSelection));

    expect(markup).not.toContain("<output");
    expect(markup).toContain('data-entity-field="totalValue"');
    expect(markup).toContain("€50000");
    expect(markup).toContain('data-entity-field="weightedValue"');
    expect(markup).toContain("€20000");
  });
});
