import { getTranslations } from "next-intl/server";

import { PageState } from "@/components/page-state/page-state";
import { PageContainer } from "@/components/shared/page-container";
import { MailboxesPageSkeleton } from "../components/profile-resource-page-skeleton";

export default async function Loading() {
  const t = await getTranslations("PageState");

  return (
    <PageContainer>
      <PageState background={<MailboxesPageSkeleton />} label={t("loading")} state="loading" />
    </PageContainer>
  );
}
