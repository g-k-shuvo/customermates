import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EntityType, LeadStatus, Resource } from "@/generated/prisma";

import { LEAD_STATUS_CHIP_COLOR } from "../lead-status-colors";
import { LEAD_DETAIL_FIELD } from "../lead-detail-personalization";

const COMPONENTS_DIR = join(process.cwd(), "app", "[locale]", "(protected)", "leads", "components");

function source(file: string): string {
  return readFileSync(join(COMPONENTS_DIR, file), "utf8");
}

describe("lead status colours", () => {
  it("assigns a chip colour to every lead status", () => {
    expect(Object.keys(LEAD_STATUS_CHIP_COLOR).toSorted()).toEqual(Object.values(LeadStatus).toSorted());
  });
});

describe("leads store", () => {
  it("scopes the data view to the leads resource and entity type", () => {
    const store = source("leads.store.tsx");

    expect(store).toContain(`super(rootStore, Resource.${Resource.leads}, EntityType.${EntityType.lead})`);
  });

  it("gates the relation columns behind the resources that supply them", () => {
    const store = source("leads.store.tsx");

    expect(store).toContain('this.canAccessContacts && { uid: "contact" }');
    expect(store).toContain('this.canAccessOrganizations && { uid: "organization" }');
  });
});

describe("lead detail personalization", () => {
  it("keeps every detail field distinct, which the p13n store keys on", () => {
    const ids = Object.values(LEAD_DETAIL_FIELD);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("renders a field for every personalization id it declares", () => {
    const view = source("lead-detail-view.tsx");

    for (const fieldId of Object.values(LEAD_DETAIL_FIELD))
      expect(view, fieldId).toContain(`LEAD_DETAIL_FIELD.${fieldId}`);
  });
});
