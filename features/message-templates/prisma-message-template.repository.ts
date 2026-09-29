import type { MessageTemplateFields, MessageTemplateRepo } from "./message-template.repo";
import type { MessageTemplateDto } from "./message-template.schema";

import { BaseRepository } from "@/core/base/base-repository";

const TEMPLATE_SELECT = {
  id: true,
  name: true,
  kind: true,
  subject: true,
  bodyMarkdown: true,
  bannerUrl: true,
  createdAt: true,
  updatedAt: true,
};

export class PrismaMessageTemplateRepo extends BaseRepository implements MessageTemplateRepo {
  async listTemplates(): Promise<MessageTemplateDto[]> {
    return await this.prisma.messageTemplate.findMany({
      where: { companyId: this.companyId },
      select: TEMPLATE_SELECT,
      orderBy: { name: "asc" },
    });
  }

  async findTemplateOrNull(id: string): Promise<MessageTemplateDto | null> {
    return await this.prisma.messageTemplate.findFirst({
      where: { id, companyId: this.companyId },
      select: TEMPLATE_SELECT,
    });
  }

  async isNameTaken(name: string, exceptId: string | null): Promise<boolean> {
    const found = await this.prisma.messageTemplate.findFirst({
      where: {
        companyId: this.companyId,
        name: { equals: name, mode: "insensitive" },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });

    return found !== null;
  }

  async createTemplate(fields: MessageTemplateFields): Promise<MessageTemplateDto> {
    return await this.prisma.messageTemplate.create({
      data: { companyId: this.companyId, createdByUserId: this.userId, ...fields },
      select: TEMPLATE_SELECT,
    });
  }

  async updateTemplate(id: string, fields: Partial<MessageTemplateFields>): Promise<MessageTemplateDto | null> {
    const updated = await this.prisma.messageTemplate.updateMany({
      where: { id, companyId: this.companyId },
      data: fields,
    });
    if (updated.count === 0) return null;

    return await this.findTemplateOrNull(id);
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const deleted = await this.prisma.messageTemplate.deleteMany({ where: { id, companyId: this.companyId } });

    return deleted.count === 1;
  }
}
