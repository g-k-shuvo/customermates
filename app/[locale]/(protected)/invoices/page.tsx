import { Resource } from "@/generated/prisma";

import { InvoicesPageView } from "./components/invoices-page-view";

import { getGetInvoicesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export default async function InvoicesPage() {
  await requireAccess({ resource: Resource.invoices });

  const initial = await unwrapValidated(getGetInvoicesInteractor().invoke({}));

  return (
    <PageContainer padded={false}>
      <InvoicesPageView initial={initial} />
    </PageContainer>
  );
}
