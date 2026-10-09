import type { Validated, Data } from "@/core/validation/validation.utils";
import type { EmailService } from "@/features/email/email.service";
import type { IssueEmailInvitationRepo } from "@/features/company/invitations/invitation.repo";

import { nanoid } from "nanoid";
import { z } from "zod";

import { createElement } from "react";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { resolveRequestOrigin } from "@/core/config/environment";
import { env } from "@/env";
import CompanyInvite from "@/components/emails/company-invite";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { getRequestAppLocale } from "@/i18n/request-app-locale";
import { EMAIL_INVITATION_EXPIRY_DAYS } from "@/features/company/invitations/invitation.schema";

export const InviteUsersByEmailSchema = z.object({
  emails: z.array(z.email()).min(1).max(20),
});

const OutputSchema = z.object({
  sent: z.number(),
});

export type InviteUsersByEmailData = Data<typeof InviteUsersByEmailSchema>;
type InviteUsersByEmailResult = Data<typeof OutputSchema>;

@TenantInteractor({ resource: Resource.users, action: Action.create })
export class InviteUsersByEmailInteractor extends AuthenticatedInteractor<
  InviteUsersByEmailData,
  InviteUsersByEmailResult
> {
  constructor(
    private readonly emailService: EmailService,
    private readonly invitations: IssueEmailInvitationRepo,
  ) {
    super();
  }

  @Validate(InviteUsersByEmailSchema)
  @ValidateOutput(OutputSchema)
  async invoke(data: InviteUsersByEmailData): Validated<InviteUsersByEmailResult> {
    const user = this.user;
    const requestOrigin = (await headers()).get("origin") ?? env.BASE_URL;
    const baseUrl = resolveRequestOrigin(requestOrigin, env.AUTH_ALLOWED_HOSTS, env.BASE_URL);
    const inviterName = `${user.firstName} ${user.lastName}`.trim();

    const t = await getTranslations();
    const locale = await getRequestAppLocale();
    const subject = t("CompanyInvite.subject");
    const preview = t("CompanyInvite.preview", { inviterName });
    const intro = t("CompanyInvite.intro", { inviterName });
    const cta = t("CompanyInvite.cta");
    const fallback = t("CompanyInvite.fallback");
    const layoutCopy = await getEmailLayoutCopy(locale);

    const uniqueEmails = Array.from(new Set(data.emails.map((e) => e.toLowerCase())));

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + EMAIL_INVITATION_EXPIRY_DAYS);

    await Promise.all(
      uniqueEmails.map(async (email) => {
        const token = await this.invitations.issueEmailInviteToken({ email, token: nanoid(32), expiresAt });

        await this.emailService.send({
          to: email,
          subject,
          react: createElement(CompanyInvite, {
            locale,
            layoutCopy,
            inviteLink: `${baseUrl}/invitation/${token}`,
            subject,
            preview,
            intro,
            cta,
            fallback,
          }),
        });
      }),
    );

    return { ok: true as const, data: { sent: uniqueEmails.length } };
  }
}
