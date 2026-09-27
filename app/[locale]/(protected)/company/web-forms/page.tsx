import { Resource } from "@/generated/prisma";

import { WebFormSourcesPageView } from "../components/webform/web-form-sources-page-view";

import { getGetWebFormSourcesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyWebFormsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.leads });

  const sourceParams = await readSurfaceParams(SURFACE.webFormSources, searchParams);

  const sources = await unwrapValidated(getGetWebFormSourcesInteractor().invoke(sourceParams));

  return (
    <PageContainer padded={false}>
      <WebFormSourcesPageView initialSources={sources} />
    </PageContainer>
  );
}
