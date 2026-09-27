import { Resource } from "@/generated/prisma";

import { LeadsPageView } from "./components/leads-page-view";

import { getGetLeadsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export const maxDuration = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeadsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.leads });

  const leadParams = await readSurfaceParams(SURFACE.leads, searchParams);

  const leads = await unwrapValidated(getGetLeadsInteractor().invoke(leadParams));

  return (
    <PageContainer padded={false}>
      <LeadsPageView leads={leads} />
    </PageContainer>
  );
}
