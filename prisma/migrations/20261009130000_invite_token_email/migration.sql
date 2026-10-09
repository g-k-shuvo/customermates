ALTER TABLE "InviteToken" ADD COLUMN "email" TEXT;

CREATE INDEX "InviteToken_companyId_email_idx" ON "InviteToken"("companyId", "email");
