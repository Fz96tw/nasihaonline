#!/usr/bin/env bash
# Idempotent provisioning of Showup's own MinIO recordings bucket: a separate
# bucket, a scoped (non-root) user that can only touch that bucket, and a
# 1-day expiry rule. Adapted from setup-minio-recordings.sh (Nasiha's), but
# Showup's credentials live in its own .env (vps/showup/.env.example) and the
# MinIO container belongs to the Nasiha stack, so we find it by its compose
# labels and `docker exec` into it directly, never through Nasiha's compose file.
#
# Safe to re-run: `mb --ignore-existing`, policy overwritten in place, an existing
# user's secret is never rotated, and the expiry rule is only added if absent.
#
# Usage (on the VPS): scripts/setup-minio-showup-recordings.sh [path/to/showup/.env]
#   Default env file: /home/ubuntu/showup/.env
set -euo pipefail

ENV_FILE="${1:-/home/ubuntu/showup/.env}"
[ -f "$ENV_FILE" ] || { echo "error: $ENV_FILE not found" >&2; exit 1; }

get_env() {
  grep -E "^${1}=" "$ENV_FILE" | tail -n1 | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//' || true
}

# Root creds are hardcoded on the Nasiha minio service (vps/docker-compose.yml).
MINIO_ROOT_USER="${MINIO_ROOT_USER:-nasiha}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-nasiha123}"
BUCKET="$(get_env MINIO_RECORDINGS_BUCKET)"
ACCESS_KEY="$(get_env MINIO_RECORDINGS_ACCESS_KEY)"
SECRET_KEY="$(get_env MINIO_RECORDINGS_SECRET_KEY)"
EXPIRE_DAYS="${EXPIRE_DAYS:-1}"
POLICY_NAME="showup-recordings-policy"

: "${BUCKET:?MINIO_RECORDINGS_BUCKET not set in $ENV_FILE}"
: "${ACCESS_KEY:?MINIO_RECORDINGS_ACCESS_KEY not set in $ENV_FILE}"
: "${SECRET_KEY:?MINIO_RECORDINGS_SECRET_KEY not set in $ENV_FILE}"

# The Nasiha stack's MinIO, found by compose labels (its project is `nasiha`).
MINIO_CONTAINER="$(docker ps -q \
  --filter label=com.docker.compose.project="${NASIHA_COMPOSE_PROJECT:-nasiha}" \
  --filter label=com.docker.compose.service=minio | head -n1)"
[ -n "$MINIO_CONTAINER" ] || { echo "error: no running Nasiha minio container found" >&2; exit 1; }

mc() {
  docker exec -i "$MINIO_CONTAINER" sh -c "export MC_HOST_local='http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@localhost:9000'; $*"
}

POLICY_JSON=$(cat <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket", "s3:ListMultipartUploadParts", "s3:AbortMultipartUpload"],
    "Resource": ["arn:aws:s3:::${BUCKET}", "arn:aws:s3:::${BUCKET}/*"]
  }]
}
POLICY
)

echo "==> [1/5] Ensuring bucket '$BUCKET' exists..."
mc "mc mb --ignore-existing local/${BUCKET}"

echo "==> [2/5] Writing scoped policy '$POLICY_NAME' (bucket-restricted)..."
mc "cat > /tmp/${POLICY_NAME}.json <<'POLICY_EOF'
${POLICY_JSON}
POLICY_EOF
mc admin policy create local ${POLICY_NAME} /tmp/${POLICY_NAME}.json; rm -f /tmp/${POLICY_NAME}.json"

echo "==> [3/5] Ensuring scoped user '$ACCESS_KEY' exists (never rotates an existing secret)..."
mc "if mc admin user info local ${ACCESS_KEY} >/dev/null 2>&1; then echo '    user already exists, leaving credentials as-is'; else mc admin user add local ${ACCESS_KEY} '${SECRET_KEY}'; fi"

echo "==> [4/5] Attaching policy to user..."
mc "mc admin policy attach local ${POLICY_NAME} --user ${ACCESS_KEY} || true"

echo "==> [5/5] Ensuring a ${EXPIRE_DAYS}-day expiry rule on '$BUCKET'..."
# The MinIO image has no grep, so the "already present?" check runs on the host.
if mc "mc ilm rule ls local/${BUCKET}" 2>/dev/null | grep -q -i 'expir'; then
  echo "    expiry rule already present"
else
  mc "mc ilm rule add --expire-days ${EXPIRE_DAYS} local/${BUCKET}"
fi

echo "==> Done. '$ACCESS_KEY' can only touch '$BUCKET'; objects expire after ${EXPIRE_DAYS} days."
