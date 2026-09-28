import { createHash } from "node:crypto";

import { DuplicateMatchKeyKind } from "@/generated/prisma";

export const MAX_BUCKET_SIZE = 25;
export const PAIR_SCORE_THRESHOLD = 0.6;

export const MATCH_KEY_WEIGHT: Record<DuplicateMatchKeyKind, number> = {
  [DuplicateMatchKeyKind.emailDomainSurname]: 0.7,
  [DuplicateMatchKeyKind.phoneLast7]: 0.7,
  [DuplicateMatchKeyKind.emailLocalPart]: 0.6,
  [DuplicateMatchKeyKind.nameKey]: 0.6,
  [DuplicateMatchKeyKind.organizationSurname]: 0.5,
  [DuplicateMatchKeyKind.nameSoundKey]: 0.3,
  [DuplicateMatchKeyKind.organizationNameKey]: 0.7,
  [DuplicateMatchKeyKind.organizationDomain]: 0.7,
  [DuplicateMatchKeyKind.organizationSoundKey]: 0.3,
};

export type KeyedRecord = { recordId: string; kind: DuplicateMatchKeyKind; value: string };

export type DuplicateCluster = {
  recordIds: string[];
  score: number;
  signals: DuplicateMatchKeyKind[];
  fingerprint: string;
};

export function pairKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

export function orderedPair(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left];
}

function pairScore(kinds: ReadonlySet<DuplicateMatchKeyKind>): number {
  let score = 0;
  for (const kind of kinds) score += MATCH_KEY_WEIGHT[kind];

  return Math.min(1, Math.round(score * 100) / 100);
}

export function clusterDuplicates(
  keyed: readonly KeyedRecord[],
  dismissedPairs: ReadonlySet<string>,
): DuplicateCluster[] {
  const buckets = new Map<string, { kind: DuplicateMatchKeyKind; recordIds: Set<string> }>();
  for (const { recordId, kind, value } of keyed) {
    const bucketKey = `${kind}\u0000${value}`;
    const bucket = buckets.get(bucketKey) ?? { kind, recordIds: new Set<string>() };
    bucket.recordIds.add(recordId);
    buckets.set(bucketKey, bucket);
  }

  const kindsByPair = new Map<string, Set<DuplicateMatchKeyKind>>();
  for (const { kind, recordIds } of buckets.values()) {
    if (recordIds.size < 2 || recordIds.size > MAX_BUCKET_SIZE) continue;

    const members = [...recordIds].sort();
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const key = pairKey(members[i], members[j]);
        if (dismissedPairs.has(key)) continue;

        const kinds = kindsByPair.get(key) ?? new Set<DuplicateMatchKeyKind>();
        kinds.add(kind);
        kindsByPair.set(key, kinds);
      }
    }
  }

  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    parent.set(id, root);
    return root;
  };

  const accepted: Array<{ left: string; right: string; score: number; kinds: Set<DuplicateMatchKeyKind> }> = [];
  for (const [key, kinds] of kindsByPair) {
    const score = pairScore(kinds);
    if (score < PAIR_SCORE_THRESHOLD) continue;

    const [left, right] = key.split("|");
    for (const id of [left, right]) if (!parent.has(id)) parent.set(id, id);
    parent.set(find(left), find(right));
    accepted.push({ left, right, score, kinds });
  }

  const clusters = new Map<string, { ids: Set<string>; score: number; signals: Set<DuplicateMatchKeyKind> }>();
  for (const { left, right, score, kinds } of accepted) {
    const root = find(left);
    const cluster = clusters.get(root) ?? { ids: new Set<string>(), score: 0, signals: new Set() };
    cluster.ids.add(left);
    cluster.ids.add(right);
    cluster.score = Math.max(cluster.score, score);
    for (const kind of kinds) cluster.signals.add(kind);
    clusters.set(root, cluster);
  }

  return [...clusters.values()]
    .map(({ ids, score, signals }) => {
      const recordIds = [...ids].sort();
      return {
        recordIds,
        score,
        signals: [...signals].sort(),
        fingerprint: createHash("sha256").update(recordIds.join(",")).digest("hex"),
      };
    })
    .sort((left, right) => right.score - left.score || right.recordIds.length - left.recordIds.length);
}

export function oversizedBuckets(keyed: readonly KeyedRecord[], limit: number) {
  const sizes = new Map<string, { kind: DuplicateMatchKeyKind; value: string; ids: Set<string> }>();
  for (const { recordId, kind, value } of keyed) {
    const bucketKey = `${kind}\u0000${value}`;
    const entry = sizes.get(bucketKey) ?? { kind, value, ids: new Set<string>() };
    entry.ids.add(recordId);
    sizes.set(bucketKey, entry);
  }

  return [...sizes.values()]
    .filter((entry) => entry.ids.size > MAX_BUCKET_SIZE)
    .map((entry) => ({ kind: entry.kind, value: entry.value, size: entry.ids.size }))
    .sort((left, right) => right.size - left.size)
    .slice(0, limit);
}

export function reviewClusterFor(
  targetId: string,
  records: ReadonlyArray<{ id: string; keys: ReadonlyArray<{ kind: DuplicateMatchKeyKind; value: string }> }>,
): DuplicateCluster | null {
  const keyed = records.flatMap((record) => record.keys.map((key) => ({ recordId: record.id, ...key })));

  return clusterDuplicates(keyed, new Set()).find((cluster) => cluster.recordIds.includes(targetId)) ?? null;
}
