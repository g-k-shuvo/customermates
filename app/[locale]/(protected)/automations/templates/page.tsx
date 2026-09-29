import { Resource } from "@/generated/prisma";

import { MessageTemplatesPageView } from "../components/templates/message-templates-page-view";

import { getGetMessageTemplatesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export default async function MessageTemplatesPage() {
  await requireAccess({ resource: Resource.automations });

  const templates = await unwrapValidated(getGetMessageTemplatesInteractor().invoke());

  return (
    <PageContainer padded={false}>
      <MessageTemplatesPageView initialTemplates={templates} />
    </PageContainer>
  );
}
