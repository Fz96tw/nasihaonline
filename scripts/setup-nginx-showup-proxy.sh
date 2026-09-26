#!/usr/bin/env bash
# Idempotent creation of Showup's nginx-proxy-manager (NPM) proxy host: a Let's
# Encrypt cert for showup.cloudcurio.com plus a host forwarding to the Showup
# container (`showup:3000` on appnet), with Websockets Support and Force SSL.
# Same approach as setup-nginx-recordings-proxy.sh: goes through NPM's own REST
# API (the write path the UI uses), so the result is durable.
#
# Run ON THE VPS (the admin API binds 127.0.0.1:81 only). Prerequisites: the DNS
# A record for the domain already points at this VPS (Let's Encrypt validates
# over port 80), and the Showup container is up. Requires curl and jq.
#
# Usage (prompts for the NPM admin login; nothing is echoed or stored):
#   ssh -t 50.6.224.185 /home/ubuntu/showup/setup-nginx-showup-proxy.sh
# Or non-interactively: NPM_EMAIL=... NPM_PASSWORD=... ./setup-nginx-showup-proxy.sh
#
# Optional env: NPM_URL (default http://127.0.0.1:81), PROXY_HOST_DOMAIN
# (default showup.cloudcurio.com), FORWARD_HOST (showup), FORWARD_PORT (3000),
# LETSENCRYPT_EMAIL (default: the NPM login email).
#
# Safe to re-run: if a host for the domain already exists it only reports its
# state and exits without changing anything.
set -euo pipefail

NPM_URL="${NPM_URL:-http://127.0.0.1:81}"
DOMAIN="${PROXY_HOST_DOMAIN:-showup.cloudcurio.com}"
FORWARD_HOST="${FORWARD_HOST:-showup}"
FORWARD_PORT="${FORWARD_PORT:-3000}"

for bin in curl jq; do
  command -v "$bin" >/dev/null || { echo "error: '$bin' is required but not found on PATH" >&2; exit 1; }
done

if [ -z "${NPM_EMAIL:-}" ]; then read -r -p "NPM admin email: " NPM_EMAIL </dev/tty; fi
if [ -z "${NPM_PASSWORD:-}" ]; then read -r -s -p "NPM admin password: " NPM_PASSWORD </dev/tty; echo; fi
LE_EMAIL="${LETSENCRYPT_EMAIL:-$NPM_EMAIL}"

api() { # method path [json-body]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" "$NPM_URL/api$path" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$body"
  else
    curl -sS -X "$method" "$NPM_URL/api$path" -H "Authorization: Bearer $TOKEN"
  fi
}

echo "==> [1/5] Authenticating to NPM at $NPM_URL..."
TOKEN="$(curl -sS -X POST "$NPM_URL/api/tokens" -H "Content-Type: application/json" \
  -d "$(jq -n --arg i "$NPM_EMAIL" --arg s "$NPM_PASSWORD" '{identity:$i, secret:$s}')" | jq -r '.token // empty')"
unset NPM_PASSWORD
[ -n "$TOKEN" ] || { echo "error: NPM authentication failed (wrong email/password?)" >&2; exit 1; }

echo "==> [2/5] Checking for an existing proxy host for '$DOMAIN'..."
EXISTING="$(api GET /nginx/proxy-hosts | jq -c --arg d "$DOMAIN" '[.[] | select(.domain_names[]? == $d)] | first // empty')"
if [ -n "$EXISTING" ]; then
  echo "    already exists: $(echo "$EXISTING" | jq -c '{id, forward: (.forward_scheme+"://"+.forward_host+":"+(.forward_port|tostring)), certificate_id, ssl_forced, allow_websocket_upgrade, enabled}')"
  echo "    nothing changed."
  exit 0
fi

echo "==> [3/5] Requesting a Let's Encrypt certificate for '$DOMAIN' (can take ~30s)..."
CERT_RESPONSE="$(api POST /nginx/certificates "$(jq -n --arg d "$DOMAIN" --arg e "$LE_EMAIL" \
  '{provider:"letsencrypt", domain_names:[$d], meta:{letsencrypt_email:$e, letsencrypt_agree:true, dns_challenge:false}}')")"
CERT_ID="$(echo "$CERT_RESPONSE" | jq -r '.id // empty')"
if [ -z "$CERT_ID" ]; then
  echo "error: certificate request failed. Does $DOMAIN resolve to this VPS and is port 80 reachable? Response:" >&2
  echo "$CERT_RESPONSE" | jq -r '.error.message // .' >&2
  exit 1
fi
echo "    certificate id $CERT_ID"

echo "==> [4/5] Creating the proxy host ($DOMAIN -> http://$FORWARD_HOST:$FORWARD_PORT)..."
HOST_RESPONSE="$(api POST /nginx/proxy-hosts "$(jq -n --arg d "$DOMAIN" --arg h "$FORWARD_HOST" --argjson p "$FORWARD_PORT" --argjson c "$CERT_ID" '{
  domain_names: [$d],
  forward_scheme: "http", forward_host: $h, forward_port: $p,
  access_list_id: 0, certificate_id: $c,
  ssl_forced: true, http2_support: true, hsts_enabled: false, hsts_subdomains: false,
  caching_enabled: false, block_exploits: true, allow_websocket_upgrade: true,
  advanced_config: "", locations: [], enabled: true,
  meta: {letsencrypt_agree: false, dns_challenge: false}
}')")"
HOST_ID="$(echo "$HOST_RESPONSE" | jq -r '.id // empty')"
[ -n "$HOST_ID" ] || { echo "error: creating the proxy host failed:" >&2; echo "$HOST_RESPONSE" | jq -r '.error.message // .' >&2; exit 1; }
echo "    proxy host id $HOST_ID"

echo "==> [5/5] Checking https://$DOMAIN/api/health ..."
sleep 3
curl -sS -m 15 -w '\n    HTTP %{http_code}\n' "https://$DOMAIN/api/health" || echo "    (not reachable yet; give NPM a few seconds and retry)"
