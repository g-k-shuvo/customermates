import { Resource } from "@/generated/prisma";

import { CampaignsPageView } from "./components/campaigns-page-view";

import { getGetCampaignsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export default async function CampaignsPage() {
  await requireAccess({ resource: Resource.campaigns });

  const initial = await unwrapValidated(getGetCampaignsInteractor().invoke());

  return (
    <PageContainer padded={false}>
      <CampaignsPageView initial={initial} />
    </PageContainer>
  );
}
