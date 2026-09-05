export type ForecastingRequestStatus = "uninitialized" | "loading" | "ready" | "error";

export type ForecastingState = "loading" | "error" | "empty" | "content";

type ForecastingStateArgs = {
  status: ForecastingRequestStatus;
  hasStages: boolean;
  hasStageValueSums: boolean;
};

export function resolveForecastingState({
  status,
  hasStages,
  hasStageValueSums,
}: ForecastingStateArgs): ForecastingState {
  if (status === "error") return "error";
  if (status === "uninitialized" || status === "loading") return "loading";
  if (!hasStages) return "empty";

  return hasStageValueSums ? "content" : "loading";
}
