import type { Data, Validated } from "@/core/validation/validation.utils";
import type { UnsubscribeRepo } from "./suppression.repo";

import { z } from "zod";

import { hashUnsubscribeToken } from "../guarded-email-sender";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";

export const UnsubscribeSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/) });
export type UnsubscribeData = Data<typeof UnsubscribeSchema>;

export type UnsubscribeOutcome =
  | { status: "unsubscribed" | "alreadyUnsubscribed"; address: string }
  | { status: "unknown" };

export function maskAddress(address: string): string {
  const [local = "", domain = ""] = address.split("@");
  const visible = local.slice(0, 1);

  return `${visible}${"*".repeat(Math.max(2, local.length - 1))}@${domain}`;
}

@SystemInteractor
export class UnsubscribeInteractor {
  constructor(private repo: UnsubscribeRepo) {}

  @Validate(UnsubscribeSchema)
  async invoke({ token }: UnsubscribeData): Validated<UnsubscribeOutcome> {
    const tokenHash = hashUnsubscribeToken(token);
    const target = await this.repo.findTokenUnscoped(tokenHash);
    if (!target) return { ok: true as const, data: { status: "unknown" } };

    await this.repo.suppressUnscoped(target, tokenHash);

    return { ok: true as const, data: { status: "unsubscribed", address: maskAddress(target.address) } };
  }

  async lookup({ token }: UnsubscribeData): Promise<UnsubscribeOutcome> {
    if (!UnsubscribeSchema.safeParse({ token }).success) return { status: "unknown" };

    const target = await this.repo.findTokenUnscoped(hashUnsubscribeToken(token));
    if (!target) return { status: "unknown" };

    const address = maskAddress(target.address);

    return (await this.repo.isSuppressedUnscoped(target))
      ? { status: "alreadyUnsubscribed", address }
      : { status: "unsubscribed", address };
  }
}
