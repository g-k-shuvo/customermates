import { redirect } from "next/navigation";
import { Action, EntityType, Resource } from "@/generated/prisma";

import { DuplicatesPageView } from "@/app/[locale]/(protected)/contacts/components/duplicates/duplicates-page-view";

import { getGetDuplicateGroupsInteractor, getUserService } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export default async function OrganizationDuplicatesPage() {
  await requireAccess({ resource: Resource.organizations });

  if (!(await getUserService().hasPermission(Resource.organizations, Action.readAll))) redirect("/organizations");

  const initial = await unwrapValidated(
    getGetDuplicateGroupsInteractor().invoke({ entityType: EntityType.organization }),
  );

  return (
    <PageContainer padded={false}>
      <DuplicatesPageView entityType={EntityType.organization} initial={initial} />
    </PageContainer>
  );
}
