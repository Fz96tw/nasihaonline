-- CreateEnum
CREATE TYPE "BodyFont" AS ENUM ('inter', 'ibm_plex_sans', 'montserrat', 'mulish');

-- CreateEnum
CREATE TYPE "HeadingFont" AS ENUM ('inter', 'lora', 'source_serif_4', 'mulish');

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "bodyFont" "BodyFont" NOT NULL DEFAULT 'montserrat',
ADD COLUMN     "headingFont" "HeadingFont" NOT NULL DEFAULT 'mulish';
