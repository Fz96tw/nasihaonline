-- DropForeignKey
ALTER TABLE "survey_answers" DROP CONSTRAINT "survey_answers_questionId_fkey";

-- AddForeignKey
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "survey_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
