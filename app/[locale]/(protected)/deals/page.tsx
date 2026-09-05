import { Resource } from "@/generated/prisma";

import { DealsPageView } from "./components/deals-page-view";

import { getGetDealsConfigurationInteractor, getGetDealsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export const maxDuration = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DealsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.deals });

  const params = await searchParams;
  const dealParams = decodeGetParams(params);

  const [deals, configuration] = await Promise.all([
    unwrapValidated(getGetDealsInteractor().invoke({ ...dealParams, p13nId: "deals-card-store" })),
    unwrapValidated(getGetDealsConfigurationInteractor().invoke()),
  ]);

  const forecastsByStage = configuration.pipelines.some((pipeline) =>
    pipeline.stages.some((stage) => stage.probability > 0),
  );

  const stages = configuration.pipelines.flatMap((pipeline) =>
    pipeline.stages.map((stage) => ({ id: stage.id, name: stage.name, probability: stage.probability })),
  );

  return (
    <PageContainer padded={false}>
      <DealsPageView deals={deals} forecastsByStage={forecastsByStage} stages={stages} />
    </PageContainer>
  );
}
