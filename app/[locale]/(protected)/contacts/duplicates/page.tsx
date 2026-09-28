import { redirect } from "next/navigation";
import { Action, EntityType, Resource } from "@/generated/prisma";

import { DuplicatesPageView } from "../components/duplicates/duplicates-page-view";

import { getGetDuplicateGroupsInteractor, getUserService } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export default async function ContactDuplicatesPage() {
  await requireAccess({ resource: Resource.contacts });

  if (!(await getUserService().hasPermission(Resource.contacts, Action.readAll))) redirect("/contacts");

  const initial = await unwrapValidated(getGetDuplicateGroupsInteractor().invoke({ entityType: EntityType.contact }));

  return (
    <PageContainer padded={false}>
      <DuplicatesPageView entityType={EntityType.contact} initial={initial} />
    </PageContainer>
  );
}
