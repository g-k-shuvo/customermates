import type { Data, Validated } from "@/core/validation/validation.utils";
import type { SenderIdentityRepo, SenderIdentityRow } from "./sender-identity.repo";
import type { TxtLookup } from "./sender-resolver";

import { randomBytes } from "node:crypto";

import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import {
  domainHasToken,
  domainOf,
  isVerified,
  verificationRecordName,
  verificationRecordValue,
} from "./sender-resolver";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const SENDER_READ = {
  permissions: [
    { resource: Resource.company, action: Action.readAll },
    { resource: Resource.company, action: Action.readOwn },
  ],
  condition: "OR" as const,
};
const SENDER_WRITE = { resource: Resource.company, action: Action.update };

export const SenderIdentityDtoSchema = z.object({
  configured: z.boolean(),
  fromName: z.string(),
  fromAddress: z.string(),
  replyTo: z.string().nullable(),
  allowUserSenders: z.boolean(),
  domain: z.string().nullable(),
  verified: z.boolean(),
  verifiedAt: z.date().nullable(),
  verificationRecord: z.object({ type: z.literal("TXT"), name: z.string(), value: z.string() }).nullable(),
});
export type SenderIdentityDto = Data<typeof SenderIdentityDtoSchema>;

export const SaveSenderIdentitySchema = z.object({
  fromName: z.string().trim().min(1).max(120),
  fromAddress: z.email(),
  replyTo: z.email().nullish(),
  allowUserSenders: z.boolean().optional(),
});
export type SaveSenderIdentityData = Data<typeof SaveSenderIdentitySchema>;

function toDto(row: SenderIdentityRow | null): SenderIdentityDto {
  if (!row) {
    return {
      configured: false,
      fromName: "",
      fromAddress: "",
      replyTo: null,
      allowUserSenders: false,
      domain: null,
      verified: false,
      verifiedAt: null,
      verificationRecord: null,
    };
  }

  const domain = domainOf(row.fromAddress);

  return {
    configured: true,
    fromName: row.fromName,
    fromAddress: row.fromAddress,
    replyTo: row.replyTo,
    allowUserSenders: row.allowUserSenders,
    domain,
    verified: isVerified(row),
    verifiedAt: isVerified(row) ? row.verifiedAt : null,
    verificationRecord: {
      type: "TXT",
      name: verificationRecordName(domain),
      value: verificationRecordValue(row.verificationToken),
    },
  };
}

@TenantInteractor(SENDER_READ)
export class GetSenderIdentityInteractor extends AuthenticatedInteractor<void, SenderIdentityDto> {
  constructor(private repo: SenderIdentityRepo) {
    super();
  }

  @ValidateOutput(SenderIdentityDtoSchema)
  async invoke(): Validated<SenderIdentityDto> {
    return { ok: true as const, data: toDto(await this.repo.findIdentityOrNull()) };
  }
}

@TenantInteractor(SENDER_WRITE)
export class SaveSenderIdentityInteractor extends AuthenticatedInteractor<SaveSenderIdentityData, SenderIdentityDto> {
  constructor(private repo: SenderIdentityRepo) {
    super();
  }

  @Write({ input: SaveSenderIdentitySchema, output: SenderIdentityDtoSchema })
  async invoke(data: SaveSenderIdentityData): Validated<SenderIdentityDto> {
    const saved = await this.repo.saveIdentity(
      {
        fromName: data.fromName,
        fromAddress: data.fromAddress.toLowerCase(),
        replyTo: data.replyTo ?? null,
        allowUserSenders: data.allowUserSenders ?? false,
      },
      randomBytes(18).toString("base64url"),
    );

    return { ok: true as const, data: toDto(saved) };
  }
}

export const ResetSenderIdentitySchema = z.object({});
export type ResetSenderIdentityData = Data<typeof ResetSenderIdentitySchema>;

@TenantInteractor(SENDER_WRITE)
export class ResetSenderIdentityInteractor extends AuthenticatedInteractor<ResetSenderIdentityData, SenderIdentityDto> {
  constructor(private repo: SenderIdentityRepo) {
    super();
  }

  @Write({ input: ResetSenderIdentitySchema, output: SenderIdentityDtoSchema })
  async invoke(_data: ResetSenderIdentityData): Validated<SenderIdentityDto> {
    await this.repo.deleteIdentity();

    return { ok: true as const, data: toDto(null) };
  }
}

export const VerifySenderDomainSchema = z.object({});
export type VerifySenderDomainData = Data<typeof VerifySenderDomainSchema>;

@TenantInteractor(SENDER_WRITE)
export class VerifySenderDomainInteractor extends AuthenticatedInteractor<VerifySenderDomainData, SenderIdentityDto> {
  constructor(
    private repo: SenderIdentityRepo,
    private lookup?: TxtLookup,
  ) {
    super();
  }

  @Write({ input: VerifySenderDomainSchema, output: SenderIdentityDtoSchema })
  async invoke(_data: VerifySenderDomainData): Validated<SenderIdentityDto> {
    const identity = await this.repo.findIdentityOrNull();
    if (!identity) return failNotFound(CustomErrorCode.senderIdentityNotFound, []);

    const domain = domainOf(identity.fromAddress);
    if (!(await domainHasToken(domain, identity.verificationToken, this.lookup)))
      return fail(CustomErrorCode.senderDomainNotVerified, [], { record: verificationRecordName(domain) });

    return { ok: true as const, data: toDto(await this.repo.markVerified(domain)) };
  }
}
