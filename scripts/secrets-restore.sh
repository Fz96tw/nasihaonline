#!/usr/bin/env bash
# Disaster recovery: decrypts the sops-encrypted secrets checked into git
# back into their real plaintext paths. Requires the age PRIVATE key at
# ~/.config/sops/age/keys.txt (or $SOPS_AGE_KEY_FILE) — that key is not in
# git, restore it from its separate backup (e.g. password manager) first.
#
# Only restores files that are present as .enc — safe to run after a fresh
# clone with just homelab/.env.enc, or with the full vps/*.enc set too.
set -euo pipefail
cd "$(dirname "$0")/.."

restore() {
  local enc="$1" out="$2" fmt="$3"
  [ -f "$enc" ] || return 0
  sops --config /dev/null --input-type "$fmt" --output-type "$fmt" -d "$enc" > "$out"
  echo "restored $out"
}

restore homelab/.env.enc homelab/.env dotenv
restore vps/.env.enc vps/.env dotenv
restore vps/livekit.yaml.enc vps/livekit.yaml yaml
restore vps/egress.yaml.enc vps/egress.yaml yaml
