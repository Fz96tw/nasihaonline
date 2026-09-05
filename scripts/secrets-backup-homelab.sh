#!/usr/bin/env bash
# Encrypts this machine's real homelab/.env with sops+age into
# homelab/.env.enc so it's recoverable from git even if this disk is lost.
set -euo pipefail
cd "$(dirname "$0")/.."

AGE_RECIPIENT="age1zfd3eunhmqa227s03kurkcf954g6trpu94qsvsyuul6l8q0meu7sycgw2v"

sops --config /dev/null --age "$AGE_RECIPIENT" --input-type dotenv --output-type dotenv -e homelab/.env > homelab/.env.enc

echo "Encrypted homelab/.env -> homelab/.env.enc"
echo "Review with: git diff --stat homelab/.env.enc"
echo "Then commit + push to actually back it up."
