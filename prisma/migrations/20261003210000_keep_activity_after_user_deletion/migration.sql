-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_actorId_fkey";

-- AlterTable
ALTER TABLE "Activity" ALTER COLUMN "actorId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

