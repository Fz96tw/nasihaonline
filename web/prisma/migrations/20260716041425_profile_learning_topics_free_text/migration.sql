-- AlterTable
-- learningTopics moves from a comma-split string[] tag list to a single
-- free-text field (matching "bio") -- collapse existing array values back
-- into the same comma-joined text the UI already rendered them as.
ALTER TABLE "profiles"
ALTER COLUMN "learningTopics" DROP DEFAULT,
ALTER COLUMN "learningTopics" SET DATA TYPE TEXT USING NULLIF(array_to_string("learningTopics", ', '), ''),
ALTER COLUMN "learningTopics" DROP NOT NULL;
