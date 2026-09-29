import { Resource } from "@/generated/prisma";

import { ListsPageView } from "./components/lists-page-view";

import { getGetContactListsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export default async function ListsPage() {
  await requireAccess({ resource: Resource.contacts });

  const initial = await unwrapValidated(getGetContactListsInteractor().invoke());

  return (
    <PageContainer padded={false}>
      <ListsPageView initial={initial} />
    </PageContainer>
  );
}
