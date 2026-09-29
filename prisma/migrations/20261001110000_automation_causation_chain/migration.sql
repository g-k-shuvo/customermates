-- AlterTable
ALTER TABLE "AutomationRun" ADD COLUMN     "causationChain" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "causationDepth" INTEGER NOT NULL DEFAULT 0;

