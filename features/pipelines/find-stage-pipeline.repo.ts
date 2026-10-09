import { type StageKind } from "@/generated/prisma";

export abstract class FindStagePipelineRepo {
  abstract findPipelineIdsByStageIds(ids: Set<string>): Promise<Map<string, string>>;
  abstract findStageKinds(ids: string[]): Promise<Map<string, StageKind>>;
}
