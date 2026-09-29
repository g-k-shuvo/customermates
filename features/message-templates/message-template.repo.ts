import type { MessageKind } from "@/generated/prisma";
import type { MessageTemplateDto } from "./message-template.schema";

export type MessageTemplateFields = {
  name: string;
  kind: MessageKind;
  subject: string;
  bodyMarkdown: string;
  bannerUrl?: string | null;
};

export abstract class MessageTemplateRepo {
  abstract listTemplates(): Promise<MessageTemplateDto[]>;
  abstract findTemplateOrNull(id: string): Promise<MessageTemplateDto | null>;
  abstract isNameTaken(name: string, exceptId: string | null): Promise<boolean>;
  abstract createTemplate(fields: MessageTemplateFields): Promise<MessageTemplateDto>;
  abstract updateTemplate(id: string, fields: Partial<MessageTemplateFields>): Promise<MessageTemplateDto | null>;
  abstract deleteTemplate(id: string): Promise<boolean>;
}
