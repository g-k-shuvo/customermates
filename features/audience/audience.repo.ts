import type { AudienceDefinition, AudienceRecipient } from "./audience.schema";

export type UnknownAudienceReferences = { listIds: string[]; columnIds: string[] };

export abstract class AudienceRepo {
  abstract findUnknownReferences(definition: AudienceDefinition): Promise<UnknownAudienceReferences>;
  abstract countAudience(definition: AudienceDefinition): Promise<{ count: number; withoutEmail: number }>;
  abstract findRecipientsPage(
    definition: AudienceDefinition,
    cursor: string | null,
    take: number,
  ): Promise<AudienceRecipient[]>;
}
