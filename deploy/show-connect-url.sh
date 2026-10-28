#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="$root/runtime/private/relay.env"
if [[ ! -r "$env_file" ]]; then
  echo 'Missing private relay configuration.' >&2
  exit 1
fi
origin="$(sed -n 's/^KARIS_PUBLIC_URL=//p' "$env_file" | head -n1)"
if [[ "$origin" != https://* && "$origin" != http://127.0.0.1* ]]; then
  echo 'Expected an HTTPS public origin or loopback-only local endpoint.' >&2
  exit 1
fi
printf '%s/mcp\n' "${origin%/}"
echo 'Connect the MCP client using OAuth. Use the dashboard to manage authorized clients and device pairing.' >&2
