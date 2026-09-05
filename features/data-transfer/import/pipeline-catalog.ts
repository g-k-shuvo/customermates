import type { CatalogIndex } from "./import-plan";

import { normalizeHeader } from "./import-mapping";

export type CatalogPipeline = { id: string; name: string; isArchived: boolean };

export type CatalogStage = { id: string; name: string; pipelineId: string };

export const QUALIFIED_STAGE_SEPARATOR = " / ";

export function qualifiedStageLabel(pipelineName: string, stageName: string): string {
  return `${pipelineName}${QUALIFIED_STAGE_SEPARATOR}${stageName}`;
}

function addLabel(index: Map<string, string[]>, label: string, id: string): void {
  const trimmed = label.trim();
  if (trimmed.length === 0) return;

  for (const key of new Set([trimmed.toLocaleLowerCase(), normalizeHeader(trimmed)])) {
    if (key.length === 0) continue;

    const found = index.get(key) ?? [];
    if (!found.includes(id)) index.set(key, [...found, id]);
  }
}

export function buildPipelineCatalogIndex(pipelines: CatalogPipeline[], stages: CatalogStage[]): CatalogIndex {
  const selectable = pipelines.filter((pipeline) => !pipeline.isArchived);
  const nameById = new Map(selectable.map((pipeline) => [pipeline.id, pipeline.name]));

  const pipeline = new Map<string, string[]>();
  for (const entry of selectable) addLabel(pipeline, entry.name, entry.id);

  const stage = new Map<string, string[]>();

  for (const entry of stages) {
    const pipelineName = nameById.get(entry.pipelineId);
    if (pipelineName === undefined) continue;

    addLabel(stage, entry.name, entry.id);
    addLabel(stage, qualifiedStageLabel(pipelineName, entry.name), entry.id);
  }

  return { pipeline, stage };
}
