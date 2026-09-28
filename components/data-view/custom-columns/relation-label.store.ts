import type { RelationTargetEntityType } from "@/features/custom-column/relation-target";

import { action, makeObservable, observable } from "mobx";

import { getRelationTargetLabelsAction } from "@/app/actions";
import { reportApplicationError } from "@/core/errors/report-application-error";

const LABEL_BATCH_SIZE = 500;

function labelKey(targetEntityType: RelationTargetEntityType, id: string) {
  return `${targetEntityType}:${id}`;
}

export class RelationLabelStore {
  readonly labels = observable.map<string, string | null>();
  private readonly requested = new Set<string>();
  private readonly queued = new Map<RelationTargetEntityType, Set<string>>();
  private flushScheduled = false;

  constructor() {
    makeObservable<RelationLabelStore, "store">(this, { remember: action, store: action });
  }

  label(targetEntityType: RelationTargetEntityType, id: string): string | null | undefined {
    const key = labelKey(targetEntityType, id);
    if (!this.requested.has(key)) this.request(targetEntityType, id);
    return this.labels.get(key);
  }

  remember(targetEntityType: RelationTargetEntityType, id: string, label: string) {
    const key = labelKey(targetEntityType, id);
    this.requested.add(key);
    this.labels.set(key, label);
  }

  private request(targetEntityType: RelationTargetEntityType, id: string) {
    this.requested.add(labelKey(targetEntityType, id));
    const ids = this.queued.get(targetEntityType) ?? new Set<string>();
    ids.add(id);
    this.queued.set(targetEntityType, ids);

    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => void this.flush().catch(reportApplicationError));
  }

  private async flush() {
    this.flushScheduled = false;
    const batches = [...this.queued].map(([targetEntityType, ids]) => ({ targetEntityType, ids: [...ids] }));
    this.queued.clear();

    await Promise.all(
      batches.flatMap(({ targetEntityType, ids }) => {
        const chunks: string[][] = [];
        for (let start = 0; start < ids.length; start += LABEL_BATCH_SIZE)
          chunks.push(ids.slice(start, start + LABEL_BATCH_SIZE));

        return chunks.map(async (chunk) => {
          const found = await getRelationTargetLabelsAction({ targetEntityType, ids: chunk });
          this.store(targetEntityType, chunk, found);
        });
      }),
    );
  }

  private store(
    targetEntityType: RelationTargetEntityType,
    ids: string[],
    found: Array<{ id: string; label: string }>,
  ) {
    const labelById = new Map(found.map((entry) => [entry.id, entry.label]));
    for (const id of ids) this.labels.set(labelKey(targetEntityType, id), labelById.get(id) ?? null);
  }
}
