-- DropForeignKey
ALTER TABLE "code_of_conduct_violations" DROP CONSTRAINT "code_of_conduct_violations_handledByUserId_fkey";

-- AlterTable
ALTER TABLE "code_of_conduct_violations" ADD COLUMN     "actionTakenAt" TIMESTAMP(3),
ALTER COLUMN "actionTaken" DROP NOT NULL,
ALTER COLUMN "handledByUserId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "code_of_conduct_violations" ADD CONSTRAINT "code_of_conduct_violations_handledByUserId_fkey" FOREIGN KEY ("handledByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
