#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
home="$here/../runtime/home"
mkdir -p "$home"
chmod 700 "$home"
export HOME="$home"
export DESKTOP_COMMANDER_DISABLE_TELEMETRY=1
export KARIS_DISABLE_TOOL_HISTORY=1
cd "$here"
exec node dist/index.js --no-onboarding
