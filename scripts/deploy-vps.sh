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

echo "==> [1/5] Building image (a full next build — a few minutes)..."
docker build \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="$CLERK_KEY" \
  --build-arg NEXT_PUBLIC_APP_URL="$PROD_APP_URL" \
  -t "$IMAGE_APP:latest" -t "$IMAGE_APP:$GIT_SHA" \
  -t "$IMAGE_WORKER:latest" -t "$IMAGE_WORKER:$GIT_SHA" \
  web/

echo "==> [2/5] Pushing to Docker Hub..."
# The :<sha> tags are for traceability only today — vps/docker-compose.yml
# still pulls :latest, so they don't yet change what gets deployed. They let
# you check "what commit is actually live" (docker inspect / Docker Hub tag
# list) without trusting that :latest was pushed from the commit you think.
for tag in latest "$GIT_SHA"; do
  docker push "$IMAGE_APP:$tag"
  docker push "$IMAGE_WORKER:$tag"
done

echo "==> [3/5] Pulling new image on the VPS..."
ssh "$VPS_HOST" "cd '$VPS_DIR' && docker compose pull app worker"

echo "==> [4/5] Recreating app + worker containers..."
ssh "$VPS_HOST" "cd '$VPS_DIR' && docker compose up -d app worker"

echo "==> [5/5] Verifying..."
sleep 3
HEALTH="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PROD_APP_URL/api/health")"
if [ "$HEALTH" != "200" ]; then
  echo "Health check returned $HEALTH, not 200 — check 'ssh $VPS_HOST docker logs nasiha-app-1' immediately." >&2
  exit 1
fi

echo "==> Deployed $GIT_SHA. Health check OK."
ssh "$VPS_HOST" "docker logs nasiha-app-1 --tail 20 2>&1" | grep -E "migration|rror|Ready" || true
