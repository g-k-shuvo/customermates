import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

export const MailAttachmentIdSchema = z.object({ id: z.uuid() });
export type MailAttachmentIdData = Data<typeof MailAttachmentIdSchema>;

export const MailAttachmentDtoSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  contentType: z.string(),
  byteSize: z.number().int(),
  inline: z.boolean(),
  stored: z.boolean(),
});
export type MailAttachmentDto = Data<typeof MailAttachmentDtoSchema>;

export type MailAttachmentRow = {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  contentId: string | null;
  inline: boolean;
  storageKey: string | null;
};

export function toMailAttachmentDto(row: MailAttachmentRow): MailAttachmentDto {
  return {
    id: row.id,
    fileName: row.fileName,
    contentType: row.contentType,
    byteSize: row.byteSize,
    inline: row.inline,
    stored: row.storageKey !== null,
  };
}

export function mailAttachmentPath(id: string): string {
  return `/api/mail-attachments/${id}`;
}
