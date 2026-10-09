import { Resource } from "@/generated/prisma";

import { AutomationsPageView } from "./components/automations-page-view";

import { getGetAutomationsInteractor } from "@/core/di";
import { env } from "@/env";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export default async function AutomationsPage() {
  await requireAccess({ resource: Resource.automations });

  const automations = await unwrapValidated(getGetAutomationsInteractor().invoke());

  return (
    <PageContainer padded={false}>
      <AutomationsPageView initialAutomations={automations} schedulesEnabled={env.AUTOMATION_SCHEDULE_ENABLED} />
    </PageContainer>
  );
}
