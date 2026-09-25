import type { DataViewSkeletonSpec } from "@/components/data-view/data-view-skeleton";

import { DataViewSkeleton } from "@/components/data-view/data-view-skeleton";

type Props = {
  animated?: boolean;
};

export function AutomationsPageSkeleton({ animated = true }: Props) {
  const spec: DataViewSkeletonSpec = { tableVariant: "entity", view: "table" };

  return <DataViewSkeleton data-automations-page-skeleton animated={animated} spec={spec} />;
}
