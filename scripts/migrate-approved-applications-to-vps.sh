#!/usr/bin/env bash
# One-time transfer of APPROVED-BUT-NEVER-ACTIVATED membership applications
# from this host's Postgres to a Postgres on another host (the VPS prod
# deployment).
#
# Background: scripts/migrate-members-to-vps.sh moved `users`/`profiles`/
# `profile_skills` — i.e. members who had actually signed in and so had a
# `users` row. An applicant who was approved but never followed their invite
# link has NO `users` row, only a `membership_applications` row, so that
# script skipped them entirely. This script moves just those application
# rows so the VPS admin can hit "Resend invite email" for each one and the
# applicant activates on the new app without re-applying.
#
# What "approved but never activated" means here: status = 'approved' and no
# `users` row on THIS host with the same (lower-cased) email.
#
# On the target the rows are inserted only when the email is not already
# present there — neither as a `users` row nor as any existing
# `membership_applications` row — so re-running is safe and it won't clobber
# an application someone submitted directly on prod.
#
# Like migrate-members-to-vps.sh, this builds a SQL file locally and scp's
# it to the target but does NOT apply it — you run the printed command on
# the target yourself.
#
# Usage: scripts/migrate-approved-applications-to-vps.sh <ssh-user@host> [remote-path]
set -euo pipefail

TARGET="${1:?Usage: $0 <ssh-user@host> [remote-path]}"
REMOTE_PATH="${2:-~/nasiha-approved-applications-transfer.sql}"

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_USER="${PG_USER:-nasiha}"
PG_DB="${PG_DB:-nasiha}"

OUT_FILE="$(mktemp -t nasiha-approved-applications-transfer-XXXXXX.sql)"
trap 'rm -f "$OUT_FILE"' EXIT

cd "$COMPOSE_DIR"

echo "==> Applications that will be staged for transfer:"
docker compose exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -P pager=off -c \
  "SELECT id, \"firstName\", \"lastName\", email, \"assignedTier\"
     FROM membership_applications a
    WHERE a.status = 'approved'
      AND lower(a.email) NOT IN (SELECT lower(email) FROM users)
    ORDER BY a.\"createdAt\";"

echo "==> Building transfer SQL..."

# Explicit, ordered column list so a column-order difference between the two
# deployments' tables can't misalign the COPY (both are built from the same
# Prisma migrations, but don't rely on that).
COLS="$(docker compose exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -At -c \
  "SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
     FROM information_schema.columns WHERE table_name = 'membership_applications';")"

SELECT_APPROVED_UNACTIVATED="
  SELECT $COLS FROM membership_applications a
   WHERE a.status = 'approved'
     AND lower(a.email) NOT IN (SELECT lower(email) FROM users)
"

{
  echo "BEGIN;"
  echo "SET search_path = public;"
  echo "CREATE TEMP TABLE _application_transfer (LIKE membership_applications INCLUDING ALL);"

  # Stream the matching rows into the temp table via COPY (text format —
  # array columns round-trip correctly). Staging into a temp table, then
  # INSERT ... WHERE NOT EXISTS, is how migrate-members-to-vps.sh handles
  # rows that may already exist on the target.
  echo "COPY _application_transfer ($COLS) FROM stdin;"
  docker compose exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -c \
    "COPY ($SELECT_APPROVED_UNACTIVATED) TO STDOUT"
  echo '\.'

  echo "SET search_path = public;"
  echo "INSERT INTO membership_applications ($COLS)"
  echo "SELECT $COLS FROM _application_transfer t"
  echo "WHERE NOT EXISTS ("
  echo "  SELECT 1 FROM users u WHERE lower(u.email) = lower(t.email)"
  echo ")"
  echo "AND NOT EXISTS ("
  echo "  SELECT 1 FROM membership_applications m WHERE lower(m.email) = lower(t.email)"
  echo ");"
  echo "DROP TABLE _application_transfer;"
  echo "COMMIT;"
} >> "$OUT_FILE"

echo "==> Copying to $TARGET:$REMOTE_PATH..."
scp "$OUT_FILE" "$TARGET:$REMOTE_PATH"

cat <<EOF

==> Done. Nothing has been applied to the target database yet.

    Apply it on the target:
      ssh $TARGET
      docker compose exec -T postgres psql -U $PG_USER -d $PG_DB < $REMOTE_PATH

    Then, on the VPS app, for each transferred application open
      /admin/applications/<id>
    and click "Resend invite email" (or script it against
    resendMemberInvitation from lib/clerk-admin.ts). That issues a fresh
    Clerk invite pointing at the VPS domain and emails it via Resend; when
    the applicant accepts, the VPS user.created webhook creates their
    User + Profile row (pre-filled from the application) with the tier the
    application already carries. No new application needed.
EOF
