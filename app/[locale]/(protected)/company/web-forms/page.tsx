import { Resource } from "@/generated/prisma";

import { WebFormSourcesPageView } from "../components/webform/web-form-sources-page-view";

import { getGetWebFormSourcesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyWebFormsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.leads });

  const params = await searchParams;
  const sourceParams = decodeGetParams(params);

  const sources = await unwrapValidated(
    getGetWebFormSourcesInteractor().invoke({ ...sourceParams, p13nId: SURFACE.webFormSources }),
  );

  return (
    <PageContainer padded={false}>
      <WebFormSourcesPageView initialSources={sources} />
    </PageContainer>
  );
}
