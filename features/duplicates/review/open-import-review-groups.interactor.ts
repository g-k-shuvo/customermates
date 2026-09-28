import type { Data, Validated } from "@/core/validation/validation.utils";
import type { DuplicateEntityType } from "../duplicate.schema";
import type { DuplicateCluster } from "../duplicate-clusters";

import { createHash } from "node:crypto";

import { z } from "zod";

import { DuplicateEntityTypeSchema, MAX_MERGE_LOSERS } from "../duplicate.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";

export const MAX_IMPORT_REVIEWS = 500;

export const OpenImportReviewGroupsSchema = z.object({
  entityType: DuplicateEntityTypeSchema,
  reviews: z
    .array(z.object({ recordId: z.uuid(), matchIds: z.array(z.uuid()).min(1).max(MAX_MERGE_LOSERS) }))
    .max(MAX_IMPORT_REVIEWS),
});
export type OpenImportReviewGroupsData = Data<typeof OpenImportReviewGroupsSchema>;

const OpenImportReviewGroupsResultSchema = z.object({ opened: z.number().int() });
type OpenImportReviewGroupsResult = z.infer<typeof OpenImportReviewGroupsResultSchema>;

export abstract class OpenImportReviewGroupsRepo {
  abstract recordIdsThatExist(entityType: DuplicateEntityType, ids: readonly string[]): Promise<Set<string>>;
  abstract openReviewGroup(entityType: DuplicateEntityType, cluster: DuplicateCluster): Promise<string>;
}

@TenantInteractor()
export class OpenImportReviewGroupsInteractor extends AuthenticatedInteractor<
  OpenImportReviewGroupsData,
  OpenImportReviewGroupsResult
> {
  constructor(private repo: OpenImportReviewGroupsRepo) {
    super();
  }

  @Write({ input: OpenImportReviewGroupsSchema, output: OpenImportReviewGroupsResultSchema })
  async invoke(data: OpenImportReviewGroupsData): Validated<OpenImportReviewGroupsResult> {
    const allIds = data.reviews.flatMap((review) => [review.recordId, ...review.matchIds]);
    const existing = await this.repo.recordIdsThatExist(data.entityType, allIds);

    let opened = 0;
    for (const review of data.reviews) {
      const recordIds = [...new Set([review.recordId, ...review.matchIds])].filter((id) => existing.has(id)).sort();
      if (recordIds.length < 2 || !recordIds.includes(review.recordId)) continue;

      await this.repo.openReviewGroup(data.entityType, {
        recordIds,
        score: 1,
        signals: [],
        fingerprint: createHash("sha256").update(recordIds.join(",")).digest("hex"),
      });
      opened++;
    }

    return { ok: true as const, data: { opened } };
  }
}
