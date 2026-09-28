import { Resource } from "@/generated/prisma";

import { InvoiceSettingsForm } from "../components/invoicing/invoice-settings-form";

import { getGetInvoiceSettingsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export default async function CompanyInvoicingPage() {
  await requireAccess({ resource: Resource.invoices });

  const settings = await unwrapValidated(getGetInvoiceSettingsInteractor().invoke());

  return (
    <PageContainer>
      <InvoiceSettingsForm settings={settings} />
    </PageContainer>
  );
}
