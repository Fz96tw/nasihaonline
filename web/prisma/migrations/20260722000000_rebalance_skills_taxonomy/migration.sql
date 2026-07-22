-- Skill catalog rebalance: SKILLS (prisma/seed.ts) was ~20 of 23 entries
-- clinical specialties, the same medical-only leftover already cleaned up
-- for Blog/Library categories in 20260721220000. Trims a couple of narrow,
-- unused clinical sub-specialties and renames the one non-clinical
-- catch-all to match the new list; the ~29 new non-clinical skills
-- (Business, Data Analytics, Marketing, etc.) are added by
-- prisma/seed.ts's next `db seed` run, not by this migration.

-- Business / Nonprofit Leadership -> Business (1:1 rename, id preserved so
-- any existing profile_skills reference survives unchanged).
UPDATE "skills" SET name = 'Business', slug = 'business' WHERE name = 'Business / Nonprofit Leadership';

-- Drop clinical sub-specialties folded away in the rebalance (verified zero
-- profile_skills references in the current dataset before writing this).
-- profile_skills.skillId is ON DELETE CASCADE, so if any member elsewhere
-- had tagged one of these, they're silently untagged rather than blocking
-- the migration -- acceptable pre-launch cleanup.
DELETE FROM "skills" WHERE name IN ('Oncology', 'Radiology', 'Palliative Care');
