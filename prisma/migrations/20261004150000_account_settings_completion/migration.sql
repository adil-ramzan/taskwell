-- CreateEnum
CREATE TYPE "AvatarType" AS ENUM ('INITIALS', 'PRESET', 'UPLOAD');

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_ownerId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarKey" TEXT,
ADD COLUMN     "avatarType" "AvatarType" NOT NULL DEFAULT 'INITIALS',
ADD COLUMN     "timeZone" TEXT,
ADD COLUMN     "twoFactorEnabledAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorPending" TEXT,
ADD COLUMN     "twoFactorSecret" TEXT;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "ownerId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecoveryCode_userId_idx" ON "RecoveryCode"("userId");

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A personal project (no team) must always have an owner. With the owner foreign
-- key now SET NULL, deleting an account that still has personal projects fails
-- here instead of leaving ownerless projects; account deletion removes them first.
ALTER TABLE "Project" ADD CONSTRAINT "Project_personal_has_owner" CHECK ("teamId" IS NOT NULL OR "ownerId" IS NOT NULL);
