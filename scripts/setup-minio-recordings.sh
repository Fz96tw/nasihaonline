#!/usr/bin/env bash
# Idempotent provisioning of every MinIO bucket the app needs, plus the
# LiveKit recordings bucket's scoped (non-root) access credentials —
# LiveKit Meeting Infrastructure initiative, objective 4. Originally done
# by hand against the running container when this feature was first built;
# this script exists so the same setup can be reproduced on a fresh deploy
# (e.g. a new VPS host) without redoing it manually.
#
# avatars/documents get no scoped policy or user: the app reads/writes them
# with MinIO's root credentials directly (see web/lib/storage.ts's
# getClient()), so they only need to exist.
#
# Reads its target bucket/user/secret from the root .env (same variables
# docker-compose.yml already interpolates: MINIO_BUCKET_RECORDINGS,
# MINIO_RECORDINGS_ACCESS_KEY, MINIO_RECORDINGS_SECRET_KEY) so the
# credentials this script provisions in MinIO always match what the app
# container is actually configured to use — nothing here generates a new
# secret for you to copy back into .env.
#
# Safe to re-run: bucket creation is --ignore-existing, the policy is
# recreated with the same name (MinIO overwrites in place), and an
# already-existing user is left untouched (its secret is never silently
# rotated out from under a working .env).
#
# Usage: scripts/setup-minio-recordings.sh
#   (run from anywhere — resolves the compose project dir itself; requires
#   the minio service to already be up: docker compose up -d minio)
set -euo pipefail

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$COMPOSE_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "error: $ENV_FILE not found — copy your .env to this host first." >&2
  exit 1
fi

# Only pull the specific vars we need, rather than sourcing the whole file
# (which holds unrelated secrets — Stripe, Clerk, Google, etc).
get_env() {
  local key="$1"
  # `|| true` on the grep: a missing key is expected/valid (callers fall
  # back with ${VAR:-default} or fail with a clear ${VAR:?message} below),
  # not a pipeline error `set -o pipefail` should abort the script over.
  grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//' || true
}

# Root creds aren't in .env at all — docker-compose.yml hardcodes them
# directly on the minio service (MINIO_ROOT_USER/MINIO_ROOT_PASSWORD), so
# mirror that here rather than reading a var that doesn't exist. Override
# via env if you've since changed them in docker-compose.yml.
MINIO_ROOT_USER="${MINIO_ROOT_USER:-nasiha}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-nasiha123}"
BUCKET="$(get_env MINIO_BUCKET_RECORDINGS)"
ACCESS_KEY="$(get_env MINIO_RECORDINGS_ACCESS_KEY)"
SECRET_KEY="$(get_env MINIO_RECORDINGS_SECRET_KEY)"
POLICY_NAME="livekit-egress-policy"

# Same fallback literals as web/lib/storage.ts's own `|| "avatars"` /
# `|| "documents"` — only overridden if these are ever set in .env.
AVATARS_BUCKET="$(get_env MINIO_BUCKET_AVATARS)"
AVATARS_BUCKET="${AVATARS_BUCKET:-avatars}"
DOCUMENTS_BUCKET="$(get_env MINIO_BUCKET_DOCUMENTS)"
DOCUMENTS_BUCKET="${DOCUMENTS_BUCKET:-documents}"

: "${BUCKET:?MINIO_BUCKET_RECORDINGS not set in $ENV_FILE}"
: "${ACCESS_KEY:?MINIO_RECORDINGS_ACCESS_KEY not set in $ENV_FILE}"
: "${SECRET_KEY:?MINIO_RECORDINGS_SECRET_KEY not set in $ENV_FILE}"

cd "$COMPOSE_DIR"

POLICY_JSON=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket", "s3:ListMultipartUploadParts", "s3:AbortMultipartUpload"],
    "Resource": ["arn:aws:s3:::${BUCKET}", "arn:aws:s3:::${BUCKET}/*"]
  }]
}
EOF
)

echo "==> [1/5] Ensuring bucket '$BUCKET' exists..."
docker compose exec -T minio sh -c "
  export MC_HOST_local='http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@localhost:9000'
  mc mb --ignore-existing local/${BUCKET}
"

echo "==> [2/5] Ensuring root-owned buckets '$AVATARS_BUCKET' and '$DOCUMENTS_BUCKET' exist..."
docker compose exec -T minio sh -c "
  export MC_HOST_local='http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@localhost:9000'
  mc mb --ignore-existing local/${AVATARS_BUCKET}
  mc mb --ignore-existing local/${DOCUMENTS_BUCKET}
"

echo "==> [3/5] Writing scoped policy '$POLICY_NAME' (bucket-restricted)..."
docker compose exec -T minio sh -c "
  export MC_HOST_local='http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@localhost:9000'
  cat > /tmp/${POLICY_NAME}.json <<'POLICY_EOF'
${POLICY_JSON}
POLICY_EOF
  mc admin policy create local ${POLICY_NAME} /tmp/${POLICY_NAME}.json
  rm -f /tmp/${POLICY_NAME}.json
"

echo "==> [4/5] Ensuring scoped user '$ACCESS_KEY' exists (never rotates an existing user's secret)..."
docker compose exec -T minio sh -c "
  export MC_HOST_local='http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@localhost:9000'
  if mc admin user info local ${ACCESS_KEY} >/dev/null 2>&1; then
    echo '    user already exists, leaving credentials as-is'
  else
    mc admin user add local ${ACCESS_KEY} '${SECRET_KEY}'
  fi
"

echo "==> [5/5] Attaching policy to user..."
docker compose exec -T minio sh -c "
  export MC_HOST_local='http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@localhost:9000'
  mc admin policy attach local ${POLICY_NAME} --user ${ACCESS_KEY}
"

cat <<EOF

==> Done. Buckets '$BUCKET', '$AVATARS_BUCKET', '$DOCUMENTS_BUCKET' all exist.
    '$ACCESS_KEY' can PutObject/GetObject/DeleteObject/ListBucket only
    within '$BUCKET' — confirm the app container's env still has matching
    MINIO_BUCKET_RECORDINGS / MINIO_RECORDINGS_ACCESS_KEY /
    MINIO_RECORDINGS_SECRET_KEY (it reads them from this same .env).
    avatars/documents need no policy — the app uses MinIO's root
    credentials for those directly.

    This only provisions MinIO itself — it does NOT set up the public
    reverse-proxy subdomain (nginx-proxy-manager host + DNS + cert) that
    lets LiveKit Cloud's egress workers reach this bucket. That's a
    separate manual step on whatever host runs your reverse proxy.
EOF
