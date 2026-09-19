#!/usr/bin/env bash
# Deactivate (retire) a forum by slug: sets forums.active = false. The forum drops off
# /forums and stops accepting new threads (getForumBySlug / createForumThread both 404 on
# an inactive forum). Nothing is deleted — threads and posts stay in the DB, and the change
# is reversible with `UPDATE forums SET active = true WHERE slug = '<slug>'`. Same approach
# used for the retired "Peer Review & Feedback" forum (see prisma/seed.ts).
#
# NOTE: existing threads in the forum are NOT hidden by this — the What's New feed, search
# and member profiles don't filter on forums.active. The dry run prints the live thread
# count so you can see whether that matters before applying.
#
# Usage: scripts/deactivate-forum.sh <forum-slug> [--apply] [ssh-user@host]
#   No --apply -> dry run: shows the forum row and its thread count, changes nothing.
#   --apply    -> runs the UPDATE in a transaction and shows the row again.
# Re-runnable: deactivating an already-inactive forum is a no-op.
set -euo pipefail

SLUG="${1:-}"
if [ -z "$SLUG" ] || [[ "$SLUG" == --* ]]; then
  echo "Usage: $0 <forum-slug> [--apply] [ssh-user@host]" >&2
  exit 1
fi
shift
if ! [[ "$SLUG" =~ ^[a-z0-9-]+$ ]]; then
  echo "Refusing slug '$SLUG': expected lowercase letters, digits and dashes only." >&2
  exit 1
fi

APPLY=0
if [ "${1:-}" = "--apply" ]; then APPLY=1; shift; fi
TARGET="${1:-ubuntu@50.6.224.185}"

PSQL="cd ~/nasiha && docker compose exec -T postgres psql -U nasiha -d nasiha"

SHOW="SELECT f.slug, f.name, f.active,
  (SELECT count(*) FROM forum_threads t WHERE t.\"forumId\" = f.id AND NOT t.removed) AS live_threads,
  (SELECT count(*) FROM forum_threads t WHERE t.\"forumId\" = f.id) AS all_threads
FROM forums f WHERE f.slug = '$SLUG';"

echo "== Current state =="
ssh "$TARGET" "$PSQL -c \"$SHOW\""

if [ "$APPLY" -eq 0 ]; then
  echo "Dry run only. If exactly one row is shown above, re-run with --apply."
  exit 0
fi

echo "== Deactivating =="
ssh "$TARGET" "$PSQL -c \"BEGIN; UPDATE forums SET active = false WHERE slug = '$SLUG'; COMMIT;\""

echo "== After =="
ssh "$TARGET" "$PSQL -c \"$SHOW\""
