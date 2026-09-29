import { Resource } from "@/generated/prisma";

import { LeadAssignmentPageView } from "./components/lead-assignment-page-view";

import { getGetLeadAssignmentRulesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export default async function LeadAssignmentPage() {
  await requireAccess({ resource: Resource.company });

  const initial = await unwrapValidated(getGetLeadAssignmentRulesInteractor().invoke());

  return (
    <PageContainer padded={false}>
      <LeadAssignmentPageView initial={initial} />
    </PageContainer>
  );
}
