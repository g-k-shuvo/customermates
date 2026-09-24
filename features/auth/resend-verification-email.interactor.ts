import type { AuthService } from "./auth.service";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { reportApplicationError } from "@/core/errors/report-application-error";

@SystemInteractor
export class ResendVerificationEmailInteractor {
  constructor(private readonly authService: AuthService) {}

  async invoke(): Promise<{ ok: boolean }> {
    const session = await this.authService.getSession();
    if (!session?.user?.email) return { ok: false };

    try {
      await this.authService.resendVerificationEmail(session.user.email, { keepSession: true });
    } catch (error) {
      reportApplicationError(error);

      return { ok: false };
    }

    return { ok: true };
  }
}
