#!/usr/bin/env bash
# One-time transfer of a single past Event — plus its recording, discussion
# thread (including the compiled LiveKit chat transcript post) and the files
# it references — from the homelab deployment (test.nasihaforyou.org) to the
# VPS prod deployment (nasihaforyou.org).
#
# What moves:
#   - events row, event_recordings, event_co_hosts, rsvps, event_registrations
#   - the event's forum_threads row + all its forum_posts + their
#     pasted_images rows, and event_chat_transcripts (which points at one of
#     those posts)
#   - MinIO objects in the `attachments` bucket: the event's hero image and
#     every pasted image in the thread. These live in homelab's OWN local
#     MinIO (MINIO_ENDPOINT=minio), so they have to be copied.
#
# What does NOT need copying: the LiveKit recording file itself. homelab's
# app already points its recordings storage at the VPS MinIO
# (MINIO_PUBLIC_ENDPOINT=vps-s3.nasihaforyou.org, same bucket name), so the
# EventRecording.objectKey already resolves to an object that lives on prod.
#
# Deliberately left behind: event_views, thread_views and
# event_notification_broadcasts (view counters / send history — meaningless
# on a deployment where they didn't happen), and event_communities/
# event_categories (the script refuses if any exist, since community and
# category ids are seeded per deployment and would need remapping by name).
#
# IDs are copied as-is. That's safe for users because
# migrate-members-to-vps.sh copied `users` with their original ids; the
# generated SQL checks up front that every referenced user exists on the
# target and aborts the whole transaction (nothing applied) if any is
# missing. The thread's forumId is the one id remapped — to whatever the
# target's own `events`-slug forum id is (forums are seeded per deployment).
#
# Like the other migrate-*-to-vps.sh scripts, this only builds and scp's a
# bundle; it applies nothing. You run the bundle's apply.sh on the VPS
# yourself. Re-running apply.sh is safe: rows use ON CONFLICT DO NOTHING and
# object uploads overwrite with identical bytes.
#
# Usage: scripts/migrate-event-to-vps.sh <event-id> [ssh-target] [remote-dir]
#   ssh-target defaults to 50.6.224.185 (the VPS SSH alias, see deploy-vps.sh)
#   BUNDLE_OUT=<dir> builds the bundle into <dir> and stops before copying
#   anything to the VPS (for inspecting/testing it first).
#   RESTRICT_TO_HOSTS=1 makes the event restricted on prod (visibility
#   `invited`, not open to public registration) with its co-hosts as the
#   invitee list — the host needs no invitee row, matching createEvent's own
#   host exclusion. The event's forum thread, recording and chat transcript
#   inherit that restriction. Public guest registrations are left behind in
#   this mode, since a restricted event can't be open to the public.
#   USER_ID_MAP="<source-id>=<target-id>[,...]" rewrites a user id on every
#   transferred row, for a member whose prod `users` row has a different id
#   (e.g. they signed up on prod directly instead of being moved by
#   migrate-members-to-vps.sh).
set -euo pipefail

EVENT_ID="${1:?Usage: $0 <event-id> [ssh-target] [remote-dir]}"
TARGET="${2:-50.6.224.185}"
REMOTE_DIR="${3:-/home/ubuntu/nasiha-event-transfer-$EVENT_ID}"
VPS_COMPOSE_DIR="${VPS_COMPOSE_DIR:-/home/ubuntu/nasiha}"

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../homelab" && pwd)"
PG_USER="${PG_USER:-nasiha}"
PG_DB="${PG_DB:-nasiha}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-nasiha}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-nasiha123}"
ATTACHMENTS_BUCKET="${MINIO_BUCKET_ATTACHMENTS:-attachments}"

if ! [[ "$EVENT_ID" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "error: event id '$EVENT_ID' has unexpected characters" >&2
  exit 1
fi

if [ -n "${BUNDLE_OUT:-}" ]; then
  BUNDLE_DIR="$BUNDLE_OUT"
  mkdir -p "$BUNDLE_DIR"
else
  BUNDLE_DIR="$(mktemp -d -t nasiha-event-transfer-XXXXXX)"
  trap 'rm -rf "$BUNDLE_DIR"' EXIT
fi
mkdir -p "$BUNDLE_DIR/objects"

cd "$COMPOSE_DIR"

psql_at() {
  docker compose exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -At -v ON_ERROR_STOP=1 -c "$1" </dev/null
}

E="'$EVENT_ID'"
THREAD_IDS="SELECT id FROM forum_threads WHERE \"eventId\" = $E"
POST_IDS="SELECT id FROM forum_posts WHERE \"threadId\" IN ($THREAD_IDS)"

# table|WHERE clause — in FK-dependency order (parents before children).
TABLES=(
  "events|id = $E"
  "event_recordings|\"eventId\" = $E"
  "event_co_hosts|\"eventId\" = $E"
  "rsvps|\"eventId\" = $E"
  "forum_threads|\"eventId\" = $E"
  "forum_posts|\"threadId\" IN ($THREAD_IDS)"
  "pasted_images|\"forumPostId\" IN ($POST_IDS)"
  "event_chat_transcripts|\"eventId\" = $E"
)

if [ "${RESTRICT_TO_HOSTS:-}" != "1" ]; then
  TABLES+=("event_registrations|\"eventId\" = $E")
fi

if [ "$(psql_at "SELECT count(*) FROM events WHERE id = $E;")" != "1" ]; then
  echo "error: event $EVENT_ID not found on this host" >&2
  exit 1
fi

TAGS="$(psql_at "SELECT (SELECT count(*) FROM event_communities WHERE \"eventId\" = $E) + (SELECT count(*) FROM event_categories WHERE \"eventId\" = $E);")"
if [ "$TAGS" != "0" ]; then
  echo "error: event has community/category tags; their ids differ per deployment and this script doesn't remap them" >&2
  exit 1
fi

REPLY_PARENTS="$(psql_at "SELECT count(*) FROM forum_posts WHERE \"threadId\" IN ($THREAD_IDS) AND \"parentPostId\" IS NOT NULL AND \"parentPostId\" NOT IN ($POST_IDS);")"
if [ "$REPLY_PARENTS" != "0" ]; then
  echo "error: a thread post replies to a post outside the thread — unexpected, not handling it" >&2
  exit 1
fi

echo "==> Rows to transfer for event $EVENT_ID:"
for entry in "${TABLES[@]}"; do
  table="${entry%%|*}"; where="${entry#*|}"
  printf '    %-24s %s\n' "$table" "$(psql_at "SELECT count(*) FROM $table WHERE $where;")"
done

echo "==> Building transfer SQL..."
SQL="$BUNDLE_DIR/transfer.sql"
{
  echo "\\set ON_ERROR_STOP on"
  echo "BEGIN;"
  echo "SET search_path = public;"
} > "$SQL"

for entry in "${TABLES[@]}"; do
  table="${entry%%|*}"; where="${entry#*|}"
  # Explicit column list so a column-order difference between deployments
  # can't misalign the COPY (same approach as the other migrate scripts).
  cols="$(psql_at "SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$table';")"
  {
    echo "CREATE TEMP TABLE _t_$table (LIKE $table INCLUDING DEFAULTS) ON COMMIT DROP;"
    echo "COPY _t_$table ($cols) FROM stdin;"
    docker compose exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 \
      -c "COPY (SELECT $cols FROM $table WHERE $where) TO STDOUT" </dev/null
    echo '\.'
  } >> "$SQL"
  echo "$table|$cols" >> "$BUNDLE_DIR/.cols"
done

if [ -n "${USER_ID_MAP:-}" ]; then
  IFS=',' read -ra PAIRS <<< "$USER_ID_MAP"
  for pair in "${PAIRS[@]}"; do
    from="${pair%%=*}"; to="${pair#*=}"
    if ! [[ "$from" =~ ^[A-Za-z0-9_-]+$ && "$to" =~ ^[A-Za-z0-9_-]+$ ]]; then
      echo "error: bad USER_ID_MAP entry '$pair' (want <source-id>=<target-id>)" >&2
      exit 1
    fi
    echo "==> USER_ID_MAP: $from -> $to"
    cat >> "$SQL" <<EOF
UPDATE _t_events SET "hostId" = '$to' WHERE "hostId" = '$from';
UPDATE _t_event_co_hosts SET "userId" = '$to' WHERE "userId" = '$from';
UPDATE _t_rsvps SET "userId" = '$to' WHERE "userId" = '$from';
UPDATE _t_forum_threads SET "authorId" = '$to' WHERE "authorId" = '$from';
UPDATE _t_forum_posts SET "authorId" = '$to' WHERE "authorId" = '$from';
UPDATE _t_pasted_images SET "uploaderId" = '$to' WHERE "uploaderId" = '$from';
EOF
  done
fi

cat >> "$SQL" <<'EOF'
-- A fresh deployment seeded the forum from its current "Events Discussion"
-- name, giving slug `events-discussion` instead of the `events` the app
-- queries (EVENTS_FORUM_SLUG) — fixed in prisma/seed.ts too, but correct it
-- here so this transfer doesn't depend on that deploy having happened.
UPDATE forums SET slug = 'events'
 WHERE name = 'Events Discussion' AND slug = 'events-discussion'
   AND NOT EXISTS (SELECT 1 FROM forums WHERE slug = 'events');

-- Forums are seeded per deployment, so point the thread at the target's own
-- `events` forum rather than the source's id.
DO $$
DECLARE forum_id text;
BEGIN
  SELECT id INTO forum_id FROM forums WHERE slug = 'events';
  IF forum_id IS NULL THEN
    RAISE EXCEPTION 'target has no forum with slug "events"';
  END IF;
  UPDATE _t_forum_threads SET "forumId" = forum_id;
END $$;

-- Every user id these rows point at must already exist on the target (moved
-- by migrate-members-to-vps.sh with the same ids). Abort — applying nothing —
-- and list them otherwise.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(DISTINCT uid, ', ') INTO missing FROM (
    SELECT "hostId" AS uid FROM _t_events
    UNION SELECT "userId" FROM _t_event_co_hosts
    UNION SELECT "userId" FROM _t_rsvps
    UNION SELECT "authorId" FROM _t_forum_threads
    UNION SELECT "authorId" FROM _t_forum_posts
    UNION SELECT "uploaderId" FROM _t_pasted_images
  ) s
  WHERE uid NOT IN (SELECT id FROM users);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'users missing on target (run migrate-members-to-vps.sh first?): %', missing;
  END IF;
END $$;
EOF

while IFS='|' read -r table cols; do
  {
    echo "INSERT INTO $table ($cols) SELECT $cols FROM _t_$table ON CONFLICT DO NOTHING;"
  } >> "$SQL"
done < "$BUNDLE_DIR/.cols"
rm -f "$BUNDLE_DIR/.cols"

if [ "${RESTRICT_TO_HOSTS:-}" = "1" ]; then
  echo "==> RESTRICT_TO_HOSTS=1: event will be restricted to its host + co-hosts on prod"
  # Applied to the real rows (not the staged temp rows) so it also takes
  # effect if an earlier unrestricted run already inserted the event.
  cat >> "$SQL" <<EOF
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM event_co_hosts WHERE "eventId" = $E AND "userId" <> (SELECT "hostId" FROM events WHERE id = $E)) THEN
    RAISE EXCEPTION 'RESTRICT_TO_HOSTS: event has no co-hosts to invite — a restricted event needs at least one invitee';
  END IF;
END \$\$;
UPDATE events SET visibility = 'invited', open = false WHERE id = $E;
INSERT INTO event_invitees (id, "eventId", "userId", "createdAt")
SELECT gen_random_uuid()::text, c."eventId", c."userId", c."createdAt"
  FROM event_co_hosts c
 WHERE c."eventId" = $E
   AND c."userId" <> (SELECT "hostId" FROM events WHERE id = $E)
ON CONFLICT DO NOTHING;
DELETE FROM event_registrations WHERE "eventId" = $E;
EOF
fi

cat >> "$SQL" <<EOF
SELECT 'events' AS t, count(*) FROM events WHERE id = $E
UNION ALL SELECT 'event_recordings', count(*) FROM event_recordings WHERE "eventId" = $E
UNION ALL SELECT 'forum_posts', count(*) FROM forum_posts WHERE "threadId" IN ($THREAD_IDS)
UNION ALL SELECT 'event_chat_transcripts', count(*) FROM event_chat_transcripts WHERE "eventId" = $E
UNION ALL SELECT 'event_invitees', count(*) FROM event_invitees WHERE "eventId" = $E
UNION ALL SELECT 'visibility=' || visibility || ' open=' || open, 1 FROM events WHERE id = $E;
COMMIT;
EOF

echo "==> Exporting attachment objects from homelab MinIO..."
KEYS="$(psql_at "
  SELECT \"heroImageUrl\" FROM events WHERE id = $E AND \"heroImageUrl\" IS NOT NULL AND \"heroImageUrl\" NOT LIKE 'http%'
  UNION SELECT \"meetingOrganizerMessageImageKey\" FROM events WHERE id = $E AND \"meetingOrganizerMessageImageKey\" IS NOT NULL
  UNION SELECT key FROM pasted_images WHERE \"forumPostId\" IN ($POST_IDS);")"

: > "$BUNDLE_DIR/objects.txt"
for key in $KEYS; do
  echo "    $key"
  docker compose exec -T minio sh -c "
    export MC_HOST_local='http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@localhost:9000'
    mc cat 'local/${ATTACHMENTS_BUCKET}/${key}'
  " </dev/null > "$BUNDLE_DIR/objects/$(echo "$key" | tr '/' '_')"
  # The app serves these with whatever Content-Type is stored on the object
  # (storage.ts's stat.metaData["content-type"]), so carry it across.
  ctype="$(docker compose exec -T minio sh -c "
    export MC_HOST_local='http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@localhost:9000'
    mc stat --json 'local/${ATTACHMENTS_BUCKET}/${key}'
  " </dev/null | jq -r '.metadata["Content-Type"] // "application/octet-stream"')"
  printf '%s\t%s\n' "$key" "$ctype" >> "$BUNDLE_DIR/objects.txt"
done

cat > "$BUNDLE_DIR/apply.sh" <<EOF
#!/usr/bin/env bash
# Generated by scripts/migrate-event-to-vps.sh for event $EVENT_ID.
# Run on the VPS from this directory: bash apply.sh
set -euo pipefail
HERE="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
cd "$VPS_COMPOSE_DIR"

echo "==> [1/3] Uploading attachment objects to prod MinIO..."
while IFS=\$'\\t' read -r key ctype; do
  [ -z "\$key" ] && continue
  echo "    \$key (\$ctype)"
  docker compose exec -T minio sh -c "
    export MC_HOST_local='http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@localhost:9000'
    mc pipe --quiet --attr 'Content-Type=\$ctype' 'local/${ATTACHMENTS_BUCKET}/\$key' >/dev/null
  " < "\$HERE/objects/\$(echo "\$key" | tr '/' '_')"
done < "\$HERE/objects.txt"

echo "==> [2/3] Applying transfer SQL (single transaction)..."
docker compose exec -T postgres psql -U $PG_USER -d $PG_DB < "\$HERE/transfer.sql"

echo "==> [3/3] Reindexing events + forum threads in Meilisearch..."
docker compose exec -T worker npx tsx scripts/reindex-events.ts </dev/null
docker compose exec -T worker npx tsx scripts/reindex-forum-threads.ts </dev/null

echo "==> Done. Check https://nasihaforyou.org/calendar/$EVENT_ID"
EOF

echo "==> Bundle contents:"
ls -la "$BUNDLE_DIR" "$BUNDLE_DIR/objects"

if [ -n "${BUNDLE_OUT:-}" ]; then
  echo "==> BUNDLE_OUT set — bundle left in $BUNDLE_DIR, nothing copied to $TARGET."
  exit 0
fi

echo "==> Copying bundle to $TARGET:$REMOTE_DIR ..."
ssh "$TARGET" "mkdir -p '$REMOTE_DIR'"
scp -r "$BUNDLE_DIR"/. "$TARGET:$REMOTE_DIR/"

cat <<EOF

==> Done. Nothing has been applied to prod yet.

    Apply it on the VPS:
      ssh $TARGET
      bash $REMOTE_DIR/apply.sh

    The SQL runs in one transaction and aborts without changing anything if
    a referenced user is missing on prod or the events forum doesn't exist.
EOF
