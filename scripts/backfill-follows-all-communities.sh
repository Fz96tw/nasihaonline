#!/usr/bin/env bash
# One-off backfill: profiles with no community selection at all (followsAllCommunities
# false AND zero profile_communities rows) become "follows all communities", matching the
# default new members now get at creation (lib/clerk-sync.ts, lib/profile-server.ts).
# Members who picked specific communities, or already follow all, are never touched.
#
# Usage: scripts/backfill-follows-all-communities.sh [--apply] [ssh-user@host]
#   No flag  -> dry run: prints the counts and the affected profiles, changes nothing.
#   --apply  -> runs the UPDATE in a transaction and prints the resulting counts.
# Re-runnable: a second --apply finds zero rows. Run it again after deploying the
# new-member default, to catch anyone created by the old code in between.
set -euo pipefail

APPLY=0
if [ "${1:-}" = "--apply" ]; then APPLY=1; shift; fi
TARGET="${1:-ubuntu@50.6.224.185}"

PSQL="cd ~/nasiha && docker compose exec -T postgres psql -U nasiha -d nasiha"

COUNTS="SELECT count(*) AS total_profiles,
  count(*) FILTER (WHERE \"followsAllCommunities\") AS follows_all,
  count(*) FILTER (WHERE NOT \"followsAllCommunities\" AND NOT EXISTS
    (SELECT 1 FROM profile_communities pc WHERE pc.\"profileId\" = p.id)) AS zero_communities
FROM profiles p;"

echo "== Before =="
ssh "$TARGET" "$PSQL -c '$COUNTS'"

if [ "$APPLY" -eq 0 ]; then
  echo "== Profiles that would change (dry run) =="
  ssh "$TARGET" "$PSQL -c 'SELECT u.email FROM profiles p JOIN users u ON u.id = p.\"userId\" WHERE NOT p.\"followsAllCommunities\" AND NOT EXISTS (SELECT 1 FROM profile_communities pc WHERE pc.\"profileId\" = p.id) ORDER BY u.email;'"
  echo "Dry run only. Re-run with --apply to update."
  exit 0
fi

echo "== Applying =="
ssh "$TARGET" "$PSQL -c 'BEGIN; UPDATE profiles p SET \"followsAllCommunities\" = true WHERE NOT p.\"followsAllCommunities\" AND NOT EXISTS (SELECT 1 FROM profile_communities pc WHERE pc.\"profileId\" = p.id); COMMIT;'"

echo "== After =="
ssh "$TARGET" "$PSQL -c '$COUNTS'"
