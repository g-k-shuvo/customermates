export type SweepableRecordFile = { id: string; storageKey: string };

export abstract class SweepRecordFilesRepo {
  abstract findSweepableFilesUnscoped(args: { pendingBefore: Date; limit: number }): Promise<SweepableRecordFile[]>;
  abstract deleteFilesUnscoped(ids: readonly string[]): Promise<number>;
}
