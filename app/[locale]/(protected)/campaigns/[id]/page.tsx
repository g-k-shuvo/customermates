import { notFound } from "next/navigation";

import { Resource } from "@/generated/prisma";

import { CampaignEditorView } from "../components/campaign-editor-view";

import { getGetCampaignInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess({ resource: Resource.campaigns });

  const { id } = await params;
  const result = await getGetCampaignInteractor().invoke({ id });
  if (!result.ok) notFound();

  return (
    <PageContainer padded={false}>
      <CampaignEditorView initial={result.data} />
    </PageContainer>
  );
}
