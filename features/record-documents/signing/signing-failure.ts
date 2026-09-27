import { SigningError, SigningFailure } from "@/core/signing/signing-provider";
import { fail, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export function signingFailure(error: unknown) {
  if (!(error instanceof SigningError)) throw error;

  if (error.failure === SigningFailure.notConfigured) return failUnavailable(CustomErrorCode.signingNotConfigured);
  if (error.failure === SigningFailure.consentRequired) return failUnavailable(CustomErrorCode.signingConsentRequired);
  if (error.failure === SigningFailure.unavailable) return failUnavailable(CustomErrorCode.signingUnavailable);

  return fail(CustomErrorCode.signingRejected);
}
