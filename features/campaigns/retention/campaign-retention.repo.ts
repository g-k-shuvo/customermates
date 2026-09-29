export abstract class CampaignRetentionRepo {
  abstract redactRecipientsFinishedBeforeUnscoped(before: Date, limit: number): Promise<number>;
}
