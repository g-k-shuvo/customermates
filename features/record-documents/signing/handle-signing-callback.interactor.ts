import type { Validated } from "@/core/validation/validation.utils";
import type { SigningEnvelopeState } from "@/core/signing/signing-provider";
import type { RecordDocumentSigningRepo } from "./record-document-signing.repo";
import type { RecordDocumentSigningService } from "./record-document-signing.service";

import { type HandleSigningCallbackResult } from "./record-document-signing.schema";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

@SystemInteractor
export class HandleSigningCallbackInteractor {
  constructor(
    private repo: RecordDocumentSigningRepo,
    private service: RecordDocumentSigningService,
  ) {}

  async invoke(state: SigningEnvelopeState): Validated<HandleSigningCallbackResult> {
    const document = await this.repo.findDocumentByEnvelopeUnscoped(state.envelopeId);
    if (!document) return { ok: true as const, data: { handled: false } };

    await this.service.apply(document, state);

    return { ok: true as const, data: { handled: true } };
  }
}
