#!/usr/bin/env bash
# Pulls the real .env/livekit.yaml/egress.yaml off the production VPS
# (they only ever live there, hand-scp'd — see CLAUDE.md), encrypts them
# with sops+age, and writes the ciphertext into vps/*.enc so they're
# recoverable from git even if the VPS disk is lost. Plaintext only ever
# touches a private tmpdir, shredded on exit.
#
# Requires: age+sops installed, SSH access to the VPS host below.
# Run from anywhere; paths are resolved relative to the repo root.
set -euo pipefail
cd "$(dirname "$0")/.."

VPS_HOST="50.6.224.185"
VPS_DIR="/home/ubuntu/nasiha"
AGE_RECIPIENT="age1zfd3eunhmqa227s03kurkcf954g6trpu94qsvsyuul6l8q0meu7sycgw2v"

tmpdir=$(mktemp -d)
trap 'find "$tmpdir" -type f -exec shred -u {} +; rmdir "$tmpdir"' EXIT

scp -q "$VPS_HOST:$VPS_DIR/.env" "$tmpdir/.env"
scp -q "$VPS_HOST:$VPS_DIR/livekit.yaml" "$tmpdir/livekit.yaml"
scp -q "$VPS_HOST:$VPS_DIR/egress.yaml" "$tmpdir/egress.yaml"

sops --config /dev/null --age "$AGE_RECIPIENT" --input-type dotenv --output-type dotenv -e "$tmpdir/.env" > vps/.env.enc
sops --config /dev/null --age "$AGE_RECIPIENT" --input-type yaml --output-type yaml -e "$tmpdir/livekit.yaml" > vps/livekit.yaml.enc
sops --config /dev/null --age "$AGE_RECIPIENT" --input-type yaml --output-type yaml -e "$tmpdir/egress.yaml" > vps/egress.yaml.enc

echo "Encrypted vps/.env, vps/livekit.yaml, vps/egress.yaml -> vps/*.enc"
echo "Review with: git diff --stat vps/*.enc"
echo "Then commit + push to actually back them up."
