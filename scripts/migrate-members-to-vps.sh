#!/usr/bin/env bash
# One-time transfer of member identity data — users, profiles, and their
# tagged skills — from this host's Postgres to a Postgres running on a
# different host (e.g. the new VPS deployment). Everything else (events,
# forum posts, knowledge items, contribution ledger, etc.) is left behind;
# this only moves who the members are, not what they've done.
#
# Run this ON THIS HOST (the source). It builds a SQL file locally and
# scp's it to the target, but does NOT apply it — you run the printed
# command on the target yourself, since applying to that database is a
# separate, deliberate step.
#
# Skill tags can't be copied as raw IDs: each deployment's `skills` table is
# seeded independently (prisma/seed.ts), so the same skill name gets a
# different id on each side. This script re-links profile_skills by skill
# NAME against whatever ids the target's own skills table already has.
#
# Users/profiles use ON CONFLICT DO NOTHING (not a full upsert) — this is a
# one-time transfer, and it just needs to skip rows that already exist on
# the target (e.g. a member who signed up directly on the target and so
# already has a `users` row there with the same clerkUserId/email) rather
# than erroring out.
#
# Usage: scripts/migrate-members-to-vps.sh <ssh-user@host> [remote-path]
set -euo pipefail

TARGET="${1:?Usage: $0 <ssh-user@host> [remote-path]}"
REMOTE_PATH="${2:-~/nasiha-members-transfer.sql}"

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_USER="${PG_USER:-nasiha}"
PG_DB="${PG_DB:-nasiha}"

OUT_FILE="$(mktemp -t nasiha-members-transfer-XXXXXX.sql)"
trap 'rm -f "$OUT_FILE"' EXIT

cd "$COMPOSE_DIR"

echo "==> [1/3] Dumping users + profiles..."
{
  echo "BEGIN;"
  docker compose exec -T postgres pg_dump -U "$PG_USER" -d "$PG_DB" \
    --data-only --inserts --on-conflict-do-nothing \
    --table=users --table=profiles
} >> "$OUT_FILE"

echo "==> [2/3] Exporting skill tags (re-linked by skill name, not id)..."
{
  # pg_dump's own section above sets search_path to '' for its duration —
  # that setting persists in this same psql session, so restore it before
  # referencing profile_skills/skills unqualified below.
  echo "SET search_path = public;"
  echo "CREATE TEMP TABLE _skill_transfer (profile_id text, skill_name text, created_at timestamptz);"
  echo "COPY _skill_transfer (profile_id, skill_name, created_at) FROM stdin;"
  docker compose exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -c \
    "COPY (SELECT ps.\"profileId\", s.name, ps.\"createdAt\" FROM profile_skills ps JOIN skills s ON s.id = ps.\"skillId\") TO STDOUT"
  echo '\.'
  echo "INSERT INTO profile_skills (\"profileId\", \"skillId\", \"createdAt\")"
  echo "SELECT t.profile_id, sk.id, t.created_at"
  echo "FROM _skill_transfer t"
  echo "JOIN skills sk ON sk.name = t.skill_name"
  echo "ON CONFLICT DO NOTHING;"
  echo "DROP TABLE _skill_transfer;"
  echo "COMMIT;"
} >> "$OUT_FILE"

echo "==> [3/3] Copying to $TARGET:$REMOTE_PATH..."
scp "$OUT_FILE" "$TARGET:$REMOTE_PATH"

cat <<EOF

==> Done. Nothing has been applied to the target database yet.

    Log into the target and apply it there, e.g.:
      ssh $TARGET
      docker compose exec -T postgres psql -U nasiha -d nasiha < $REMOTE_PATH

    (adjust the compose project dir / -U / -d if the target uses different
    values than PG_USER=$PG_USER PG_DB=$PG_DB)
EOF
