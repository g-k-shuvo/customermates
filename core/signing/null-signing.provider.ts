import type { SigningProvider } from "./signing-provider";

import { SigningError, SigningFailure } from "./signing-provider";

const refuse = () => Promise.reject(new SigningError(SigningFailure.notConfigured));

export const nullSigningProvider: SigningProvider = {
  configured: false,
  sendEnvelope: refuse,
  voidEnvelope: refuse,
  fetchEnvelope: refuse,
  downloadCompletedPdf: refuse,
  verifyCallback: () => false,
  parseCallback: () => null,
};
