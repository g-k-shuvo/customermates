import { notFound } from "next/navigation";
import { Resource } from "@/generated/prisma";

import { InvoiceDetailView } from "../components/invoice-detail-view";

import { getGetInvoiceInteractor, getGetInvoiceSettingsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = { params: Promise<{ id: string }> };

export default async function InvoicePage({ params }: Props) {
  await requireAccess({ resource: Resource.invoices });

  const { id } = await params;
  const [invoice, settings] = await Promise.all([
    getGetInvoiceInteractor().invoke({ id }),
    unwrapValidated(getGetInvoiceSettingsInteractor().invoke()),
  ]);

  if (!invoice.ok) notFound();

  return (
    <PageContainer padded={false}>
      <InvoiceDetailView initial={invoice.data} settings={settings} />
    </PageContainer>
  );
}
