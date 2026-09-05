import type { StageKind } from "@/generated/prisma";

export abstract class FindTerminalStageRepo {
  abstract findStageIdByKind(pipelineId: string, kind: StageKind): Promise<string | null>;
}
