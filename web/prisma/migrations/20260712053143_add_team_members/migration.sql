-- CreateEnum
CREATE TYPE "TeamRoleBadge" AS ENUM ('founder', 'board_member', 'partner');

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleBadge" "TeamRoleBadge" NOT NULL,
    "title" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "photoUrl" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- Seed data: the three known Founder/Board records from the homepage's
-- pre-removal "Founded By" section (commit 151a8b2), per PRD §4.12
-- acceptance criteria. Bios are placeholder professional copy pending
-- admin-supplied content; Partner role is intentionally left empty per
-- open question §11.9.
INSERT INTO "team_members" ("id", "name", "roleBadge", "title", "bio", "photoUrl", "displayOrder", "active", "createdAt", "updatedAt") VALUES
('seed-team-uzma-khan', 'Dr. Uzma Khan', 'founder', 'Physician', 'Dr. Uzma Khan is a physician and one of NASIHA''s founders. She helped shape the organization''s founding vision of a global, fee-free community built on reciprocal teaching and learning, and continues to guide its direction as a member of the Board.', NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('seed-team-nadeem-haider', 'Nadeem Haider', 'board_member', 'Technology Executive', 'Nadeem Haider is a technology executive who serves on NASIHA''s Board, bringing experience building and scaling products to help grow the community''s platform and reach.', NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('seed-team-nighat-abidi', 'Nighat Abidi', 'board_member', 'Technology Executive', 'Nighat Abidi is a technology executive who serves on NASIHA''s Board, contributing her expertise to help build the systems and processes that support the community''s growth.', NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
