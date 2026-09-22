export type WebFormSourceRecord = {
  id: string;
  companyId: string;
  signingSecret: string;
};

export type StoreSubmissionArgs = {
  companyId: string;
  sourceId: string;
  externalId: string | null;
  rawPayload: unknown;
};

export type ConsumeRateLimitArgs = {
  sourceId: string;
  companyId: string;
  windowMs: number;
  max: number;
};

export abstract class IngestWebFormSubmissionRepo {
  abstract findActiveSourceBySlugUnscoped(slug: string): Promise<WebFormSourceRecord | null>;
  abstract consumeRateLimitUnscoped(args: ConsumeRateLimitArgs): Promise<boolean>;
  abstract storeSubmissionUnscoped(args: StoreSubmissionArgs): Promise<{ id: string; created: boolean }>;
}
