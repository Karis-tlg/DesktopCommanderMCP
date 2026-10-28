#!/usr/bin/env bash
set -euo pipefail

# Restart only the two Karis self-host services. Never kill generic Node processes.
sudo systemctl restart karis-mcp-relay.service
sudo systemctl restart karis-mcp-agent.service

for _ in $(seq 1 40); do
  health="$(curl -fsS --max-time 3 http://127.0.0.1:18791/healthz 2>/dev/null || true)"
  if [[ -n "$health" ]] && printf '%s' "$health" | grep -q '"maxDevices":32' && printf '%s' "$health" | grep -q '"toolCount":' && printf '%s' "$health" | grep -q '"agent":true'; then
    printf '%s\n' "$health"
    echo 'Self-host relay and agent are online.'
    exit 0
  fi
  sleep 1
done

echo 'Relay did not become healthy with an online agent. Check:' >&2
echo '  sudo systemctl status karis-mcp-relay.service karis-mcp-agent.service' >&2
echo '  journalctl -u karis-mcp-relay.service -u karis-mcp-agent.service -n 80 --no-pager' >&2
exit 1
