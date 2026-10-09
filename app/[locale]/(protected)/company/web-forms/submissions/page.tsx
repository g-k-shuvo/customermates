import { redirect } from "next/navigation";
import { Action, Resource } from "@/generated/prisma";

import { WebFormSubmissionsPageView } from "../../components/webform/web-form-submissions-page-view";

import { getGetWebFormSubmissionsInteractor, getUserService } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyWebFormSubmissionsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.leads });

  if (!(await getUserService().hasPermission(Resource.leads, Action.readAll))) redirect("/dashboard");

  const submissionParams = await readSurfaceParams(SURFACE.webFormSubmissions, searchParams);

  const submissions = await unwrapValidated(getGetWebFormSubmissionsInteractor().invoke(submissionParams));

  return (
    <PageContainer padded={false}>
      <WebFormSubmissionsPageView initialSubmissions={submissions} />
    </PageContainer>
  );
}
