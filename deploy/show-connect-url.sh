#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
private="$root/runtime/private"
key_file="$private/link.key"
env_file="$private/relay.env"
if [[ ! -r "$key_file" || ! -r "$env_file" ]]; then
  echo 'Missing private link key or relay configuration.' >&2
  exit 1
fi
origin="$(sed -n 's/^KARIS_PUBLIC_URL=//p' "$env_file" | head -n1)"
key="$(cat "$key_file")"
if [[ "$origin" != https://* || ${#key} -lt 40 ]]; then
  echo 'Invalid public origin or link key.' >&2
  exit 1
fi
printf '%s/mcp/%s\n' "${origin%/}" "$key"
