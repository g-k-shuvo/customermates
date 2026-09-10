import { afterAll, beforeAll, describe, expect, it } from "vitest";

import deMessages from "@/i18n/locales/de.json";
import enMessages from "@/i18n/locales/en.json";
import esMessages from "@/i18n/locales/es.json";
import frMessages from "@/i18n/locales/fr.json";
import itMessages from "@/i18n/locales/it.json";
import { APP_LOCALES, type AppLocale } from "@/i18n/locale-registry";

import { monthStartDate, widgetDataPointLabel } from "../widget-label";

const DIAGRAMS = {
  de: deMessages.Diagrams,
  en: enMessages.Diagrams,
  es: esMessages.Diagrams,
  fr: frMessages.Diagrams,
  it: itMessages.Diagrams,
} satisfies Record<AppLocale, typeof enMessages.Diagrams>;

describe("widgetDataPointLabel", () => {
  it.each(APP_LOCALES)("localizes system labels for %s", (locale) => {
    const translate = (key: string) => DIAGRAMS[locale][key.split(".")[1] as "noGroup" | "total"];

    expect(widgetDataPointLabel({ labelKind: "system", systemLabelKey: "total", value: 1 }, translate)).toBe(
      DIAGRAMS[locale].total,
    );
    expect(widgetDataPointLabel({ labelKind: "system", systemLabelKey: "noGroup", value: 1 }, translate)).toBe(
      DIAGRAMS[locale].noGroup,
    );
  });

  it.each(["Total", "No Group", "no-group"])("preserves the literal user label %s", (label) => {
    expect(widgetDataPointLabel({ labelKind: "literal", label, value: 1 }, () => "translated")).toBe(label);
  });

  it("does not render a technical UUID label in the dashboard", () => {
    const id = "40c4d2e1-c17c-4e48-834f-7a700d55e56a";

    expect(widgetDataPointLabel({ labelKind: "literal", label: id, value: 1 }, () => "Unavailable")).toBe(
      "Unavailable",
    );
  });

  it("hands a month bucket to the shared formatter as the first instant of that month where the viewer is", () => {
    const seen: Date[] = [];
    const label = widgetDataPointLabel(
      { labelKind: "month", month: "2026-03", value: 1 },
      () => "translated",
      (date) => {
        seen.push(date);
        return "March 2026";
      },
    );

    expect(label).toBe("March 2026");
    expect(seen[0].getFullYear()).toBe(2026);
    expect(seen[0].getMonth()).toBe(2);
    expect(seen[0].getDate()).toBe(1);
    expect(seen[0].getHours()).toBe(0);
  });

  it("falls back to the machine-readable month when no formatter is available yet", () => {
    expect(widgetDataPointLabel({ labelKind: "month", month: "2026-03", value: 1 }, () => "translated")).toBe(
      "2026-03",
    );
    expect(
      widgetDataPointLabel(
        { labelKind: "month", month: "2026-03", value: 1 },
        () => "translated",
        () => "",
      ),
    ).toBe("2026-03");
  });

  it("reads December as the twelfth month rather than rolling into the next year", () => {
    const december = monthStartDate("2026-12");

    expect(december.getFullYear()).toBe(2026);
    expect(december.getMonth()).toBe(11);
    expect(december.getDate()).toBe(1);
  });
});

describe("widgetDataPointLabel for a viewer west of UTC", () => {
  const originalTimeZone = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });

  afterAll(() => {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  });

  function monthLabelAsRendered(month: string): string {
    return widgetDataPointLabel(
      { labelKind: "month", month, value: 1 },
      () => "translated",
      (date) => new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long" }).format(date),
    );
  }

  it("names the month the bucket carries and not the one before it", () => {
    expect(new Date(2026, 2, 1).getTimezoneOffset()).toBeGreaterThan(0);
    expect(monthLabelAsRendered("2026-03")).toBe("March 2026");
    expect(monthLabelAsRendered("2026-01")).toBe("January 2026");
  });
});
