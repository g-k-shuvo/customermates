import { describe, expect, it } from "vitest";

import { DuplicateMatchKeyKind } from "@/generated/prisma";

import { clusterDuplicates, MAX_BUCKET_SIZE, oversizedBuckets, pairKey, reviewClusterFor } from "../duplicate-clusters";

const key = (recordId: string, kind: DuplicateMatchKeyKind, value: string) => ({ recordId, kind, value });

describe("clustering duplicate candidates", () => {
  it("joins records linked by strong signals into one group, transitively", () => {
    const clusters = clusterDuplicates(
      [
        key("a", DuplicateMatchKeyKind.phoneLast7, "1234567"),
        key("b", DuplicateMatchKeyKind.phoneLast7, "1234567"),
        key("b", DuplicateMatchKeyKind.nameKey, "ada lovelace"),
        key("c", DuplicateMatchKeyKind.nameKey, "ada lovelace"),
      ],
      new Set(),
    );

    expect(clusters).toHaveLength(1);
    expect(clusters[0].recordIds).toEqual(["a", "b", "c"]);
    expect(clusters[0].signals).toEqual([DuplicateMatchKeyKind.nameKey, DuplicateMatchKeyKind.phoneLast7]);
  });

  it("ignores a weak signal on its own and counts it alongside another", () => {
    const weakOnly = clusterDuplicates(
      [
        key("a", DuplicateMatchKeyKind.nameSoundKey, "at lflk"),
        key("b", DuplicateMatchKeyKind.nameSoundKey, "at lflk"),
      ],
      new Set(),
    );
    const combined = clusterDuplicates(
      [
        key("a", DuplicateMatchKeyKind.nameSoundKey, "at lflk"),
        key("b", DuplicateMatchKeyKind.nameSoundKey, "at lflk"),
        key("a", DuplicateMatchKeyKind.organizationSurname, "org|lovelace"),
        key("b", DuplicateMatchKeyKind.organizationSurname, "org|lovelace"),
      ],
      new Set(),
    );

    expect(weakOnly).toEqual([]);
    expect(combined[0].score).toBe(0.8);
  });

  it("drops a dismissed pair before joining, so it cannot come back inside a larger group", () => {
    const keyed = ["a", "b", "c"].map((id) => key(id, DuplicateMatchKeyKind.nameKey, "ada lovelace"));

    const clusters = clusterDuplicates(keyed, new Set([pairKey("a", "b"), pairKey("a", "c")]));

    expect(clusters.map((cluster) => cluster.recordIds)).toEqual([["b", "c"]]);
  });

  it("skips a bucket too large to be a real duplicate and reports it", () => {
    const keyed = Array.from({ length: MAX_BUCKET_SIZE + 1 }, (_, index) =>
      key(`r${index}`, DuplicateMatchKeyKind.emailLocalPart, "sales.team"),
    );

    expect(clusterDuplicates(keyed, new Set())).toEqual([]);
    expect(oversizedBuckets(keyed, 10)).toEqual([
      { kind: DuplicateMatchKeyKind.emailLocalPart, value: "sales.team", size: MAX_BUCKET_SIZE + 1 },
    ]);
  });

  it("fingerprints a group by its member set, independent of order", () => {
    const forward = clusterDuplicates(
      [key("a", DuplicateMatchKeyKind.nameKey, "x y"), key("b", DuplicateMatchKeyKind.nameKey, "x y")],
      new Set(),
    );
    const reverse = clusterDuplicates(
      [key("b", DuplicateMatchKeyKind.nameKey, "x y"), key("a", DuplicateMatchKeyKind.nameKey, "x y")],
      new Set(),
    );

    expect(forward[0].fingerprint).toBe(reverse[0].fingerprint);
  });
});

describe("the review cluster for a newly captured record", () => {
  it("returns the group the new record falls into, or nothing when it matches no one strongly", () => {
    const records = [
      { id: "new", keys: [{ kind: DuplicateMatchKeyKind.nameKey, value: "ada lovelace" }] },
      { id: "old", keys: [{ kind: DuplicateMatchKeyKind.nameKey, value: "ada lovelace" }] },
      { id: "other", keys: [{ kind: DuplicateMatchKeyKind.nameSoundKey, value: "at lflk" }] },
    ];

    expect(reviewClusterFor("new", records)?.recordIds).toEqual(["new", "old"]);
    expect(reviewClusterFor("other", records)).toBeNull();
  });
});
