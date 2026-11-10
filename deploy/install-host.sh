#!/usr/bin/env bash
set -Eeuo pipefail
repo=https://github.com/Karis-tlg/DesktopCommanderMCP.git
for cmd in node npm git curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then echo "Install Node.js 22.12+, git and curl first (missing $cmd)." >&2; exit 2; fi
done
node -e 'const v=process.versions.node.split(".").map(Number);if(v[0]<22||(v[0]===22&&v[1]<12))process.exit(1)' || { echo 'Need Node.js >=22.12' >&2; exit 2; }
args=("$@")
mode=0
for arg in "${args[@]}"; do [[ "$arg" == --url || "$arg" == --tailscale ]] && mode=1; done
if (( mode == 0 )); then
  if command -v tailscale >/dev/null 2>&1 && tailscale status --json >/dev/null 2>&1; then
    args+=(--tailscale)
    echo 'Using Tailscale Funnel for HTTPS.'
  else
    if [[ ! -r /dev/tty ]]; then echo 'Pass --url https://your-domain or --tailscale.' >&2; exit 2; fi
    read -r -p 'Public HTTPS URL: ' url </dev/tty
    args+=(--url "$url")
  fi
fi
approved=0
for arg in "${args[@]}"; do [[ "$arg" == --yes || "$arg" == --dry-run || "$arg" == --no-systemd ]] && approved=1; done
if (( approved == 0 )); then
  echo 'A new Karis MCP relay and local agent will be installed as systemd services.'
  echo 'Existing service and Tailscale routes will not be overwritten.'
  if [[ ! -r /dev/tty ]]; then echo 'Pass --yes for unattended installation.' >&2; exit 2; fi
  read -r -p 'Install? [y/N] ' answer </dev/tty
  [[ "$answer" =~ ^([yY]|[yY][eE][sS])$ ]] || { echo 'Cancelled'; exit 1; }
  args+=(--yes)
fi
dir="$(mktemp -d /tmp/karis-host-bootstrap.XXXXXXXX)"
cleanup(){ if [[ -n "${dir:-}" && -d "$dir" && "$dir" == /tmp/karis-host-bootstrap.* ]]; then rm -rf -- "$dir"; fi; }
trap cleanup EXIT
git clone --depth=1 --branch main --quiet "$repo" "$dir/repository"
node "$dir/repository/deploy/host-cli.mjs" install --source "$dir/repository" "${args[@]}"
