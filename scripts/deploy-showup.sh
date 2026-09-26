#!/usr/bin/env bash
# Builds showup/ from the current git HEAD, pushes it to Docker Hub, and
# redeploys ONLY the `showup` service on the VPS (showup.cloudcurio.com), from
# its own compose project (vps/showup/docker-compose.yml, living at
# /home/ubuntu/showup on the VPS). Cloned from deploy-vps.sh, but it never
# touches the Nasiha stack: no Nasiha service is pulled, restarted or
# recreated, and `--no-deps` keeps Showup's Redis out of the recreate.
#
# Requires: docker logged into Docker Hub (`docker login`), the VPS SSH alias
# (~/.ssh/config: Host 50.6.224.185, User ubuntu), and the one-time VPS setup in
# vps/showup/README.md already done (compose file + .env on the VPS, stack up).
#
# DRY_RUN=1 prints every remote/push step instead of running it (the local
# build still runs).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VPS_HOST="${VPS_HOST:-50.6.224.185}"
VPS_DIR="${VPS_DIR:-/home/ubuntu/showup}"
IMAGE="${IMAGE:-fz96tw/showup-app}"
# Baked into the client bundle at build time, so it's hardcoded here rather than read from any .env.
PROD_APP_URL="${PROD_APP_URL:-https://showup.cloudcurio.com}"
HEALTH_URL="${HEALTH_URL:-$PROD_APP_URL/api/health}"
DRY_RUN="${DRY_RUN:-0}"

run() {
  if [ "$DRY_RUN" = "1" ]; then echo "    [dry-run] $*"; else "$@"; fi
}

cd "$REPO_ROOT"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree has uncommitted changes — commit or stash first, so the deployed image traces back to a real commit." >&2
  exit 1
fi

GIT_SHA="$(git rev-parse --short HEAD)"
echo "==> Deploying Showup commit $GIT_SHA to $VPS_HOST"

echo "==> [1/6] Building image..."
docker build \
  --build-arg NEXT_PUBLIC_APP_URL="$PROD_APP_URL" \
  -t "$IMAGE:latest" -t "$IMAGE:$GIT_SHA" \
  showup/

echo "==> [2/6] Pushing to Docker Hub..."
for tag in latest "$GIT_SHA"; do
  run docker push "$IMAGE:$tag"
done

echo "==> [3/6] Checking the VPS compose file matches this repo (it's hand-copied, so it can drift)..."
LOCAL_SUM="$(sha256sum vps/showup/docker-compose.yml | cut -d' ' -f1)"
if [ "$DRY_RUN" = "1" ]; then
  echo "    [dry-run] ssh $VPS_HOST sha256sum $VPS_DIR/docker-compose.yml (local: $LOCAL_SUM)"
else
  REMOTE_SUM="$(ssh "$VPS_HOST" "sha256sum '$VPS_DIR/docker-compose.yml' 2>/dev/null | cut -d' ' -f1" || true)"
  if [ -z "$REMOTE_SUM" ]; then
    echo "No compose file at $VPS_HOST:$VPS_DIR — do the one-time setup in vps/showup/README.md first." >&2
    exit 1
  fi
  if [ "$REMOTE_SUM" != "$LOCAL_SUM" ]; then
    echo "    WARNING: $VPS_DIR/docker-compose.yml differs from vps/showup/docker-compose.yml." >&2
    echo "    Deploying the image anyway; copy the file up (scp) if the change was intentional." >&2
  fi
fi

echo "==> [4/6] Pulling the new image on the VPS..."
run ssh "$VPS_HOST" "cd '$VPS_DIR' && docker compose pull showup"

echo "==> [5/6] Recreating ONLY the showup service (Nasiha stack and showup-redis untouched)..."
run ssh "$VPS_HOST" "cd '$VPS_DIR' && docker compose up -d --no-deps showup && docker image prune -f"

echo "==> [6/6] Verifying $HEALTH_URL ..."
if [ "$DRY_RUN" = "1" ]; then
  echo "    [dry-run] curl $HEALTH_URL (up to 6 attempts)"
else
  HEALTH="000"
  BODY=""
  for i in 1 2 3 4 5 6; do
    sleep 5
    HEALTH="$(curl -s -o /tmp/showup-health.json -w '%{http_code}' --max-time 10 "$HEALTH_URL" || true)"
    [ "$HEALTH" = "200" ] && break
    echo "    ...attempt $i: got $HEALTH, retrying"
  done
  if [ "$HEALTH" != "200" ]; then
    echo "Health check returned $HEALTH, not 200 after 30s of retries — check 'ssh $VPS_HOST docker logs showup-showup-1' immediately." >&2
    exit 1
  fi
  BODY="$(cat /tmp/showup-health.json)"
  echo "    $BODY"
  case "$BODY" in
    *'"status":"degraded"'*) echo "    NOTE: app is up but a dependency is reported down (see above)." ;;
  esac
fi

echo "==> Deployed Showup $GIT_SHA."

echo "==> Cleaning up old local images..."
docker images "$IMAGE" --format '{{.Tag}}' | grep -v -E "^(latest|$GIT_SHA)$" | while read -r tag; do
  docker rmi "$IMAGE:$tag" || true
done
