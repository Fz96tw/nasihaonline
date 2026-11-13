#!/usr/bin/env bash
# Builds the app/worker image from the current git HEAD, pushes it to Docker
# Hub, and redeploys it on the VPS (nasihaforyou.org). This is the only path
# that gets a code change from this repo onto the live site — the VPS has no
# source checkout of its own and never builds locally (unlike homelab, which
# rebuilds in place via `docker compose up -d --build`), so the Docker Hub
# round-trip isn't optional infrastructure, it's the actual deploy mechanism.
#
# Run from anywhere; paths are relative to this script's location. Requires:
# docker already logged into Docker Hub (`docker login`), and the VPS SSH
# alias already set up (~/.ssh/config: Host 50.6.224.185, User ubuntu,
# IdentityFile ~/.ssh/id_ed25519_nasiha_vps).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VPS_HOST="${VPS_HOST:-50.6.224.185}"
VPS_DIR="${VPS_DIR:-/home/ubuntu/nasiha}"
IMAGE_APP="${IMAGE_APP:-fz96tw/nasihaonline-app}"
IMAGE_WORKER="${IMAGE_WORKER:-fz96tw/nasihaonline-worker}"
# Baked into the compiled bundle at build time — Next.js inlines every
# NEXT_PUBLIC_* reference everywhere it appears, server code included, not
# just client code (see lib/email.ts's APP_URL usage) — so this has to be
# the VPS's real domain, not read from the VPS's own environment: at
# container start. Deliberately hardcoded, not sourced from any .env: this
# script's whole job is producing the one image meant for this one domain.
PROD_APP_URL="${PROD_APP_URL:-https://nasihaforyou.org}"
# The compose file the VPS runs. The repo's vps/docker-compose.yml is the
# source of truth: this script copies it over (after showing the diff and
# asking) so settings changes reach the server with the code that needs them —
# e.g. the worker's MinIO settings, which once stayed behind for a deploy and
# silently broke article images. Set DEPLOY_YES=1 to accept the diff without a
# prompt (required when running non-interactively).
LOCAL_COMPOSE="vps/docker-compose.yml"
REMOTE_COMPOSE="$VPS_DIR/docker-compose.yml"
# Overridable so the compose-sync steps can be exercised against a fake host.
SSH="${SSH:-ssh}"
SCP="${SCP:-scp}"

cd "$REPO_ROOT"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree has uncommitted changes — commit or stash first, so the deployed image traces back to a real commit." >&2
  exit 1
fi

GIT_SHA="$(git rev-parse --short HEAD)"
echo "==> Deploying commit $GIT_SHA to $VPS_HOST"

CLERK_KEY="$(grep '^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=' homelab/.env | cut -d= -f2-)"
if [ -z "$CLERK_KEY" ]; then
  echo "Couldn't read NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY from homelab/.env" >&2
  exit 1
fi

# Prints one compose service's block (its "  name:" line through the line
# before the next top-level service or section).
compose_service_block() {
  awk -v name="$2" '
    $0 ~ "^  " name ":[[:space:]]*$" { inside = 1; print; next }
    inside && ($0 ~ /^  [^ #]/ || $0 ~ /^[^ #]/) { inside = 0 }
    inside { print }
  ' "$1"
}

compose_service_names() {
  awk '/^services:/ { s = 1; next } s && /^[^ #]/ { s = 0 } s && /^  [A-Za-z0-9_.-]+:[[:space:]]*$/ { sub(/:.*/, ""); sub(/^  /, ""); print }' "$1"
}

echo "==> [1/10] Checking the VPS compose file against $LOCAL_COMPOSE..."
COMPOSE_TMP="$(mktemp -d)"
trap 'rm -rf "$COMPOSE_TMP"' EXIT
if ! $SSH "$VPS_HOST" "cat '$REMOTE_COMPOSE'" > "$COMPOSE_TMP/remote.yml"; then
  echo "Couldn't read $REMOTE_COMPOSE on $VPS_HOST." >&2
  exit 1
fi
SYNC_COMPOSE="no"
if cmp -s "$COMPOSE_TMP/remote.yml" "$LOCAL_COMPOSE"; then
  echo "    Already up to date."
else
  echo "    The VPS compose file differs from $LOCAL_COMPOSE (- VPS, + repo):"
  diff -u --label "VPS $REMOTE_COMPOSE" --label "repo $LOCAL_COMPOSE" "$COMPOSE_TMP/remote.yml" "$LOCAL_COMPOSE" | sed 's/^/    /' || true
  OTHER_CHANGED=""
  for svc in $( { compose_service_names "$COMPOSE_TMP/remote.yml"; compose_service_names "$LOCAL_COMPOSE"; } | sort -u); do
    case "$svc" in app|worker) continue ;; esac
    if ! cmp -s <(compose_service_block "$COMPOSE_TMP/remote.yml" "$svc") <(compose_service_block "$LOCAL_COMPOSE" "$svc"); then
      OTHER_CHANGED="$OTHER_CHANGED $svc"
    fi
  done
  if [ -n "$OTHER_CHANGED" ]; then
    echo "    NOTE: services other than app/worker changed:$OTHER_CHANGED"
    echo "    This deploy only recreates app and worker; apply the rest afterwards with:"
    echo "      ssh $VPS_HOST 'cd $VPS_DIR && docker compose up -d$OTHER_CHANGED'"
  fi
  if [ "${DEPLOY_YES:-}" = "1" ]; then
    echo "    DEPLOY_YES=1 — the repo's compose file will be copied to the VPS."
  elif [ -t 0 ]; then
    read -r -p "    Copy the repo's compose file to the VPS as part of this deploy? [y/N] " REPLY
    case "$REPLY" in
      y|Y|yes|YES) ;;
      *) echo "Deploy cancelled — nothing was built or changed." >&2; exit 1 ;;
    esac
  else
    echo "The compose file differs and this isn't an interactive terminal — rerun with DEPLOY_YES=1 to accept the diff above." >&2
    exit 1
  fi
  SYNC_COMPOSE="yes"
fi

echo "==> [2/10] Building image (a full next build — a few minutes)..."
docker build \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="$CLERK_KEY" \
  --build-arg NEXT_PUBLIC_APP_URL="$PROD_APP_URL" \
  -t "$IMAGE_APP:latest" -t "$IMAGE_APP:$GIT_SHA" \
  -t "$IMAGE_WORKER:latest" -t "$IMAGE_WORKER:$GIT_SHA" \
  web/

echo "==> [3/10] Pushing to Docker Hub..."
# The :<sha> tags are for traceability only today — vps/docker-compose.yml
# still pulls :latest, so they don't yet change what gets deployed. They let
# you check "what commit is actually live" (docker inspect / Docker Hub tag
# list) without trusting that :latest was pushed from the commit you think.
for tag in latest "$GIT_SHA"; do
  docker push "$IMAGE_APP:$tag"
  docker push "$IMAGE_WORKER:$tag"
done

echo "==> [4/10] Syncing the compose file to the VPS..."
if [ "$SYNC_COMPOSE" = "yes" ]; then
  BACKUP="$REMOTE_COMPOSE.bak-$(date +%Y%m%d-%H%M%S)"
  $SSH "$VPS_HOST" "cp '$REMOTE_COMPOSE' '$BACKUP'"
  $SCP "$LOCAL_COMPOSE" "$VPS_HOST:$REMOTE_COMPOSE"
  if ! $SSH "$VPS_HOST" "cd '$VPS_DIR' && docker compose config -q"; then
    $SSH "$VPS_HOST" "cp '$BACKUP' '$REMOTE_COMPOSE'"
    echo "The new compose file doesn't validate on the VPS — restored the previous copy ($BACKUP) and stopped. The new image is pushed but not deployed." >&2
    exit 1
  fi
  echo "    Copied (previous version saved as $BACKUP)."
else
  echo "    Nothing to copy."
fi

echo "==> [5/10] Pulling new image on the VPS..."
$SSH "$VPS_HOST" "cd '$VPS_DIR' && docker compose pull app worker"

echo "==> [6/10] Recreating app + worker containers..."
$SSH "$VPS_HOST" "cd '$VPS_DIR' && docker compose up -d app worker"

echo "==> [7/10] Pruning old image left behind by the :latest pull on the VPS..."
$SSH "$VPS_HOST" "docker image prune -f"

echo "==> [8/10] Verifying..."
# The container runs a data-seed step (skills, communities, forums, etc.)
# before Next.js even binds its port, so a fixed short sleep here can catch
# the app mid-startup and get a false-alarm 503 from the proxy. Retry with
# backoff instead of a single check.
HEALTH="000"
for i in 1 2 3 4 5 6; do
  sleep 5
  HEALTH="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PROD_APP_URL/api/health")"
  [ "$HEALTH" = "200" ] && break
  echo "    ...attempt $i: got $HEALTH, retrying"
done
if [ "$HEALTH" != "200" ]; then
  echo "Health check returned $HEALTH, not 200 after 30s of retries — check 'ssh $VPS_HOST docker logs nasiha-app-1' immediately." >&2
  exit 1
fi

echo "==> Deployed $GIT_SHA. Health check OK."
$SSH "$VPS_HOST" "docker logs nasiha-app-1 --tail 20 2>&1" | grep -E "migration|rror|Ready" || true

echo "==> [9/10] Warming the homepage cache..."
# The homepage is prerendered during `docker build`, which has no route to
# the database, so the image ships a copy whose "Find Your Community" list is
# empty (CommunitiesSection's .catch(() => [])). ISR (revalidate = 60 in
# app/layout.tsx) serves that stale copy to the first visitor and rebuilds in
# the background, so request it ourselves now and wait until the rebuilt
# page, which has the per-community "community-desc-" ids, is the one being served.
WARM="no"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s --max-time 15 "$PROD_APP_URL/" | grep -q 'community-desc-'; then
    WARM="yes"
    break
  fi
  sleep 3
done
if [ "$WARM" = "yes" ]; then
  echo "    Homepage is serving the live communities list."
else
  echo "    WARNING: homepage still has no communities after ~30s. Check that the DB has communities and 'docker logs nasiha-app-1'." >&2
fi

echo "==> [10/10] Cleaning up old local images (each build tags a new :\$GIT_SHA that never gets removed)..."
for img in "$IMAGE_APP" "$IMAGE_WORKER"; do
  # `|| true`: grep exits 1 when there are no old tags, which pipefail +
  # errexit would turn into a failed deploy after a successful one.
  docker images "$img" --format '{{.Tag}}' | { grep -v -E "^(latest|$GIT_SHA)$" || true; } | while read -r tag; do
    docker rmi "$img:$tag" || true
  done
done
