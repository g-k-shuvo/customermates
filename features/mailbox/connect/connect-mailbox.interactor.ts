import type { ConnectMailboxRepo } from "./connect-mailbox.repo";
import type { MailboxTransport, MailboxTransportFailure } from "../sync/mailbox-transport";
import type { SecretBoxKey } from "../credentials/secret-box";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { ConnectMailboxSchema, MailboxCredentialDtoSchema, type ConnectMailboxData } from "../mailbox.schema";
import { MailboxTransportError } from "../sync/mailbox-transport";
import { checkImapHost } from "../sync/imap-host-guard";
import { sealSecret } from "../credentials/secret-box";
import { resolveSmtpSettings } from "./smtp-settings";
import { type MailboxCredentialDto } from "../mailbox.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail, failConflict, failUnavailable } from "@/core/validation/interactor-failure-server";

const DAY_MS = 24 * 60 * 60 * 1000;

const FAILURE_CODES: Record<MailboxTransportFailure, CustomErrorCode> = {
  hostRejected: CustomErrorCode.mailboxHostRejected,
  unresolvableHost: CustomErrorCode.mailboxUnreachable,
  connectionRefused: CustomErrorCode.mailboxUnreachable,
  connectionTimedOut: CustomErrorCode.mailboxUnreachable,
  tlsFailed: CustomErrorCode.mailboxTlsFailed,
  authenticationFailed: CustomErrorCode.mailboxAuthenticationFailed,
  folderMissing: CustomErrorCode.mailboxFolderMissing,
  protocolFailed: CustomErrorCode.mailboxProtocolFailed,
};

const FAILURE_PATHS: Record<MailboxTransportFailure, string[]> = {
  hostRejected: ["imapHost"],
  unresolvableHost: ["imapHost"],
  connectionRefused: ["imapHost"],
  connectionTimedOut: ["imapHost"],
  tlsFailed: ["imapHost"],
  authenticationFailed: ["secret"],
  folderMissing: ["imapHost"],
  protocolFailed: ["imapHost"],
};

@TenantInteractor({
  resource: Resource.inboxMessages,
  action: Action.create,
})
export class ConnectMailboxInteractor extends AuthenticatedInteractor<ConnectMailboxData, MailboxCredentialDto> {
  constructor(
    private repo: ConnectMailboxRepo,
    private transport: MailboxTransport,
    private secretKey: SecretBoxKey | null,
    private now: () => Date,
    private allowPrivateHosts = false,
  ) {
    super();
  }

  private rejectsSmtpHost(smtpHost: string | undefined): boolean {
    if (!smtpHost || this.allowPrivateHosts) return false;

    return !checkImapHost(smtpHost).allowed;
  }

  @Write({
    input: ConnectMailboxSchema,
    output: MailboxCredentialDtoSchema,
  })
  async invoke(data: ConnectMailboxData): Validated<MailboxCredentialDto> {
    if (!this.secretKey) return failUnavailable(CustomErrorCode.mailboxSecretKeyMissing);

    const existing = await this.repo.findMailboxByAddress(data.emailAddress);
    if (existing) return failConflict(CustomErrorCode.mailboxAlreadyConnected, ["emailAddress"]);

    if (this.rejectsSmtpHost(data.smtpHost)) return await fail(CustomErrorCode.mailboxHostRejected, ["smtpHost"]);

    const connection = {
      host: data.imapHost,
      port: data.imapPort,
      secure: data.imapSecure,
      username: data.username,
      secret: data.secret,
    };

    try {
      await this.transport.verify(connection);
    } catch (error) {
      if (error instanceof MailboxTransportError)
        return await fail(FAILURE_CODES[error.failure], FAILURE_PATHS[error.failure]);

      return await fail(CustomErrorCode.mailboxProtocolFailed, ["imapHost"]);
    }

    const verifiedAt = this.now();
    const mailbox = await this.repo.createMailboxOrThrow({
      emailAddress: data.emailAddress,
      displayName: data.displayName ?? null,
      imapHost: data.imapHost,
      imapPort: data.imapPort,
      imapSecure: data.imapSecure,
      username: data.username,
      sealedSecret: sealSecret(this.secretKey, data.secret),
      ...resolveSmtpSettings(data),
      backfillFrom: new Date(verifiedAt.getTime() - data.backfillDays * DAY_MS),
      verifiedAt,
    });

    return { ok: true as const, data: mailbox };
  }
}
