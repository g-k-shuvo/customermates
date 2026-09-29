-- CreateEnum
CREATE TYPE "MailboxOAuthProvider" AS ENUM ('google', 'microsoft');

-- AlterTable
ALTER TABLE "MailboxCredential" ADD COLUMN     "oauthProvider" "MailboxOAuthProvider";
