export const LEAD_DETAIL_P13N_ID = "lead-detail";

export const LEAD_DETAIL_FIELD = {
  title: "title",
  status: "status",
  value: "value",
  contactId: "contactId",
  organizationId: "organizationId",
  ownerUserId: "ownerUserId",
  labels: "labels",
  source: "source",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
} as const;

export const LEAD_DETAIL_SECTION = {
  base: "base",
  relations: "relations",
  customFields: "customFields",
} as const;
