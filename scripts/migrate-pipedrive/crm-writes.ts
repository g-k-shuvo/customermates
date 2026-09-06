/**
 * The single seam between "decide what to write" and "actually write it".
 *
 * The dry run swaps in a recorder that hands back synthetic ids, so the migration
 * takes exactly the same code path with or without `--dry-run` and the counts in
 * the reconciliation report describe the run that would happen.
 */

import type { CrmClient, CrmLostReason, CrmPipeline, CrmRecord, CrmService, CrmStage } from "./crm-client";
import type { CustomColumnType, EntityType } from "@/generated/prisma";

import { randomUUID } from "node:crypto";

export type CustomColumnInput = {
  entityType: EntityType;
  type: CustomColumnType;
  label: string;
  selectOptions?: { label: string }[];
  options?: Record<string, unknown>;
};

export type CrmWrites = {
  readonly dryRun: boolean;
  createRecord(entityPath: string, payload: Record<string, unknown>): Promise<CrmRecord>;
  updateRecord(entityPath: string, id: string, payload: Record<string, unknown>): Promise<CrmRecord>;
  createPipeline(payload: Record<string, unknown>): Promise<CrmPipeline>;
  createStage(pipelineId: string, payload: Record<string, unknown>): Promise<CrmStage>;
  createLostReason(payload: Record<string, unknown>): Promise<CrmLostReason>;
  createService(payload: Record<string, unknown>): Promise<CrmService>;
  createCustomColumn(input: CustomColumnInput): Promise<void>;
  markDealWon(id: string): Promise<void>;
  markDealLost(id: string, payload: { lostReasonId: string; lostNotes?: string }): Promise<void>;
  reopenDeal(id: string, stageId?: string): Promise<void>;
};

export function liveWrites(client: CrmClient): CrmWrites {
  return {
    dryRun: false,
    createRecord: (entityPath, payload) => client.createRecord(entityPath, payload),
    updateRecord: (entityPath, id, payload) => client.updateRecord(entityPath, id, payload),
    createPipeline: (payload) => client.createPipeline(payload),
    createStage: (pipelineId, payload) => client.createStage(pipelineId, payload),
    createLostReason: (payload) => client.createLostReason(payload),
    createService: (payload) => client.createService(payload),
    createCustomColumn: (input) => client.createCustomColumn(input),
    markDealWon: async (id) => {
      await client.markDealWon(id);
    },
    markDealLost: async (id, payload) => {
      await client.markDealLost(id, payload);
    },
    reopenDeal: async (id, stageId) => {
      await client.reopenDeal(id, stageId);
    },
  };
}

function syntheticRecord(payload: Record<string, unknown>): CrmRecord {
  return {
    id: randomUUID(),
    ...(typeof payload.name === "string" ? { name: payload.name } : {}),
    customFieldValues: [],
  };
}

export function dryRunWrites(): CrmWrites {
  const resolved = <T>(value: T) => Promise.resolve(value);

  return {
    dryRun: true,
    createRecord: (_entityPath, payload) => resolved(syntheticRecord(payload)),
    updateRecord: (_entityPath, id, payload) => resolved({ ...syntheticRecord(payload), id }),
    createPipeline: (payload) =>
      resolved({
        id: randomUUID(),
        name: String(payload.name ?? ""),
        position: Number(payload.position ?? 0),
        stages: ((payload.stages as { name: string; kind: string }[] | undefined) ?? []).map((stage, index) => ({
          id: randomUUID(),
          name: stage.name,
          position: index,
          kind: stage.kind,
        })),
      }),
    createStage: (_pipelineId, payload) =>
      resolved({
        id: randomUUID(),
        name: String(payload.name ?? ""),
        position: Number(payload.position ?? 0),
        kind: String(payload.kind ?? "open"),
      }),
    createLostReason: (payload) =>
      resolved({ id: randomUUID(), name: String(payload.name ?? ""), position: Number(payload.position ?? 0) }),
    createService: (payload) =>
      resolved({ id: randomUUID(), name: String(payload.name ?? ""), amount: Number(payload.amount ?? 0) }),
    createCustomColumn: () => resolved(undefined),
    markDealWon: () => resolved(undefined),
    markDealLost: () => resolved(undefined),
    reopenDeal: () => resolved(undefined),
  };
}
