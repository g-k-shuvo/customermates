export const SigningFailure = {
  notConfigured: "notConfigured",
  consentRequired: "consentRequired",
  rejected: "rejected",
  notFound: "notFound",
  unavailable: "unavailable",
} as const;

export type SigningFailure = (typeof SigningFailure)[keyof typeof SigningFailure];

export class SigningError extends Error {
  constructor(
    readonly failure: SigningFailure,
    readonly detail?: string,
  ) {
    super(detail ? `${failure}: ${detail}` : failure);
    this.name = "SigningError";
  }
}

export const SigningEnvelopeStatus = {
  sent: "sent",
  delivered: "delivered",
  completed: "completed",
  declined: "declined",
  voided: "voided",
} as const;

export type SigningEnvelopeStatus = (typeof SigningEnvelopeStatus)[keyof typeof SigningEnvelopeStatus];

export type SigningRecipient = { name: string; email: string };

export type SigningRecipientState = SigningRecipient & {
  status: string;
  completedAt: Date | null;
};

export type SigningEnvelopeState = {
  envelopeId: string;
  status: SigningEnvelopeStatus | null;
  recipients: SigningRecipientState[];
};

export type SigningProvider = {
  readonly configured: boolean;
  sendEnvelope(args: {
    subject: string;
    message: string | null;
    fileName: string;
    pdf: Uint8Array;
    recipients: readonly SigningRecipient[];
    callbackUrl: string;
  }): Promise<{ envelopeId: string }>;
  voidEnvelope(envelopeId: string, reason: string): Promise<void>;
  fetchEnvelope(envelopeId: string): Promise<SigningEnvelopeState>;
  downloadCompletedPdf(envelopeId: string): Promise<Uint8Array>;
  verifyCallback(rawBody: string, signatures: readonly string[]): boolean;
  parseCallback(rawBody: string): SigningEnvelopeState | null;
};
