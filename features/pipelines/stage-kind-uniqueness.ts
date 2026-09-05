import { StageKind } from "@/generated/prisma";

export function duplicateStageKindIndex(stages: Array<{ kind: StageKind }>): number | null {
  const claimed = new Set<StageKind>();

  for (const [index, stage] of stages.entries()) {
    if (stage.kind === StageKind.open) continue;
    if (claimed.has(stage.kind)) return index;

    claimed.add(stage.kind);
  }

  return null;
}
