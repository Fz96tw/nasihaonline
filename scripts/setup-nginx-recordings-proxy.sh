#!/usr/bin/env bash
# Idempotent setup of the one nginx-proxy-manager (NPM) tweak the LiveKit
# recordings bucket's public reverse-proxy host needs: disabled response/
# request buffering. Without it, nginx buffers the whole upstream response
# to a temp file capped by the stock proxy_max_temp_file_size (1024m
# default) before forwarding it — any recording over ~1 GiB (~70+ min of
# LiveKit egress at current encoding settings) gets silently truncated
# partway through download. Root-caused and fixed manually against the live
# VPS on 2026-08-27 (the "Board Meeting" recording download bug); this
# script exists so the same fix survives a from-scratch NPM rebuild without
# anyone having to remember/rediscover it.
#
# Goes through NPM's own REST API (not a direct file/DB edit) specifically
# so the change is durable: NPM regenerates a host's nginx conf from its own
# database on every save (UI or API), which would silently wipe a raw file
# patch the next time anyone edits this host through the UI. Going through
# the API is the same write path the UI itself uses, so it persists.
#
# Must run from the VPS host itself (or anywhere with a tunnel to it) — the
# NPM admin API binds 127.0.0.1:81 only, not the public interface (see
# docker ps / vps/docker-compose.yml's nginx_proxy_manager port mapping).
#
# Requires: curl, jq.
#
# Usage:
#   NPM_EMAIL=you@example.com NPM_PASSWORD='...' scripts/setup-nginx-recordings-proxy.sh
#
# Optional env overrides:
#   NPM_URL              default: http://127.0.0.1:81
#   PROXY_HOST_DOMAIN    default: vps-s3.nasihaforyou.org
#
# Safe to re-run: does nothing (prints "already configured") if the host's
# advanced_config already contains the fix.
set -euo pipefail

: "${NPM_EMAIL:?Set NPM_EMAIL to your Nginx Proxy Manager admin email}"
: "${NPM_PASSWORD:?Set NPM_PASSWORD to your Nginx Proxy Manager admin password}"
NPM_URL="${NPM_URL:-http://127.0.0.1:81}"
PROXY_HOST_DOMAIN="${PROXY_HOST_DOMAIN:-vps-s3.nasihaforyou.org}"

FIX_SNIPPET='proxy_buffering off;
proxy_request_buffering off;'

for bin in curl jq; do
  command -v "$bin" >/dev/null || { echo "error: '$bin' is required but not found on PATH" >&2; exit 1; }
done

echo "==> [1/4] Authenticating to NPM at $NPM_URL..."
TOKEN_RESPONSE=$(curl -sS -X POST "$NPM_URL/api/tokens" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg identity "$NPM_EMAIL" --arg secret "$NPM_PASSWORD" '{identity: $identity, secret: $secret}')")
TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.token // empty')
if [ -z "$TOKEN" ]; then
  echo "error: authentication failed — response was:" >&2
  echo "$TOKEN_RESPONSE" >&2
  exit 1
fi

echo "==> [2/4] Finding proxy host for '$PROXY_HOST_DOMAIN'..."
HOSTS=$(curl -sS "$NPM_URL/api/nginx/proxy-hosts" -H "Authorization: Bearer $TOKEN")
HOST_JSON=$(echo "$HOSTS" | jq -c --arg domain "$PROXY_HOST_DOMAIN" \
  '.[] | select(.domain_names[]? == $domain)')
if [ -z "$HOST_JSON" ]; then
  echo "error: no proxy host found with domain '$PROXY_HOST_DOMAIN'." >&2
  echo "       Create it first (DNS + cert + host pointing at minio:9000)," >&2
  echo "       then re-run this script to add the buffering fix." >&2
  exit 1
fi

HOST_ID=$(echo "$HOST_JSON" | jq -r '.id')
CURRENT_ADVANCED_CONFIG=$(echo "$HOST_JSON" | jq -r '.advanced_config // ""')

if echo "$CURRENT_ADVANCED_CONFIG" | grep -q "proxy_buffering off"; then
  echo "==> [3/4] Host $HOST_ID already has the buffering fix — nothing to do."
  exit 0
fi

echo "==> [3/4] Updating host $HOST_ID's advanced_config..."
NEW_ADVANCED_CONFIG="$CURRENT_ADVANCED_CONFIG"
if [ -n "$NEW_ADVANCED_CONFIG" ]; then
  NEW_ADVANCED_CONFIG="$NEW_ADVANCED_CONFIG

$FIX_SNIPPET"
else
  NEW_ADVANCED_CONFIG="$FIX_SNIPPET"
fi

# NPM's PUT expects the full host object back (a partial body silently
# drops every field it omits), so patch the fetched object in place rather
# than constructing a request from scratch.
UPDATE_BODY=$(echo "$HOST_JSON" | jq --arg cfg "$NEW_ADVANCED_CONFIG" '.advanced_config = $cfg')

UPDATE_RESPONSE=$(curl -sS -X PUT "$NPM_URL/api/nginx/proxy-hosts/$HOST_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$UPDATE_BODY")

if echo "$UPDATE_RESPONSE" | jq -e '.error' >/dev/null 2>&1; then
  echo "error: NPM rejected the update:" >&2
  echo "$UPDATE_RESPONSE" | jq . >&2
  exit 1
fi

echo "==> [4/4] Done. NPM regenerates and reloads this host's nginx config on save,"
echo "    so the fix is already live — no separate reload needed."
