import { Action, Resource } from "@/generated/prisma";

export const INVOICE_READ = { resource: Resource.invoices, action: Action.readAll };
export const INVOICE_CREATE = { resource: Resource.invoices, action: Action.create };
export const INVOICE_UPDATE = { resource: Resource.invoices, action: Action.update };
export const INVOICE_DELETE = { resource: Resource.invoices, action: Action.delete };
export const INVOICE_SETTINGS_UPDATE = { resource: Resource.company, action: Action.update };
export const BILLING_READ = {
  permissions: [
    { resource: Resource.organizations, action: Action.readAll },
    { resource: Resource.organizations, action: Action.readOwn },
  ],
  condition: "OR" as const,
};
export const BILLING_UPDATE = { resource: Resource.organizations, action: Action.update };
