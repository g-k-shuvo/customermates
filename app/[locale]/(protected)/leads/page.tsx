import { Resource } from "@/generated/prisma";

import { LeadsPageView } from "./components/leads-page-view";

import { getGetLeadsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export const maxDuration = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeadsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.leads });

  const params = await searchParams;
  const leadParams = decodeGetParams(params);

  const leads = await unwrapValidated(
    getGetLeadsInteractor().invoke({
      ...leadParams,
      p13nId: "leads-card-store",
    }),
  );

  return (
    <PageContainer padded={false}>
      <LeadsPageView leads={leads} />
    </PageContainer>
  );
}
