import type { Validated } from "@/core/validation/validation.utils";
import type { ContentDisposition, StorageProvider } from "@/core/storage/storage-provider";
import type { GetMailAttachmentRepo } from "../mail-attachment.repo";

import { Action, Resource } from "@/generated/prisma";

import { type MailAttachmentIdData, MailAttachmentIdSchema } from "../mail-attachment.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { StorageError, StorageFailure } from "@/core/storage/storage-provider";
import { dispositionFor, servedContentTypeFor } from "@/core/storage/upload-policy";
import { failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export type MailAttachmentContent = {
  fileName: string;
  contentType: string;
  disposition: ContentDisposition;
  byteSize: number;
  body: ReadableStream<Uint8Array>;
};

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetMailAttachmentInteractor extends AuthenticatedInteractor<MailAttachmentIdData, MailAttachmentContent> {
  constructor(
    private repo: GetMailAttachmentRepo,
    private storage: StorageProvider,
  ) {
    super();
  }

  @Validate(MailAttachmentIdSchema)
  async invoke({ id }: MailAttachmentIdData): Validated<MailAttachmentContent> {
    const attachment = await this.repo.findReadableAttachmentOrNull(id);
    if (!attachment) return failNotFound(CustomErrorCode.mailAttachmentNotFound, ["id"]);
    if (!attachment.storageKey) return failNotFound(CustomErrorCode.mailAttachmentNotStored, ["id"]);
    if (!this.storage.configured) return failUnavailable(CustomErrorCode.fileStorageNotConfigured);

    const contentType = servedContentTypeFor(attachment.contentType);

    try {
      const object = await this.storage.getObject(attachment.storageKey);

      return {
        ok: true as const,
        data: {
          fileName: attachment.fileName,
          contentType,
          disposition: dispositionFor(contentType),
          byteSize: object.byteSize,
          body: object.body,
        },
      };
    } catch (error) {
      if (!(error instanceof StorageError)) throw error;
      if (error.failure === StorageFailure.notFound)
        return failNotFound(CustomErrorCode.mailAttachmentNotStored, ["id"]);

      return failUnavailable(CustomErrorCode.fileStorageUnavailable);
    }
  }
}
