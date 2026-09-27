import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

export const SIGNATURE_RECIPIENT_LIMIT = 10;
export const SIGNATURE_SUBJECT_MAX_LENGTH = 100;
export const SIGNATURE_MESSAGE_MAX_LENGTH = 2000;

export const SignatureRecipientSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254),
});

export type SignatureRecipient = Data<typeof SignatureRecipientSchema>;

export const SendForSignatureSchema = z.object({
  id: z.uuid(),
  recipients: z
    .array(SignatureRecipientSchema)
    .min(1)
    .max(SIGNATURE_RECIPIENT_LIMIT)
    .refine(
      (recipients) => new Set(recipients.map((recipient) => recipient.email.toLowerCase())).size === recipients.length,
      {
        params: { error: CustomErrorCode.signatureRecipientDuplicate },
      },
    ),
  subject: z.string().trim().min(1).max(SIGNATURE_SUBJECT_MAX_LENGTH).optional(),
  message: z.string().trim().max(SIGNATURE_MESSAGE_MAX_LENGTH).optional(),
});

export type SendForSignatureData = Data<typeof SendForSignatureSchema>;

export const VoidSignatureSchema = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(1).max(200).optional(),
});

export type VoidSignatureData = Data<typeof VoidSignatureSchema>;

export const SignatureSuggestionsDtoSchema = z.object({
  recipients: z.array(z.object({ name: z.string(), email: z.string() })),
});

export type SignatureSuggestionsDto = Data<typeof SignatureSuggestionsDtoSchema>;

export const HandleSigningCallbackResultSchema = z.object({
  handled: z.boolean(),
});

export type HandleSigningCallbackResult = Data<typeof HandleSigningCallbackResultSchema>;
