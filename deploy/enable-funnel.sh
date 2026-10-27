#!/usr/bin/env bash
set -euo pipefail
root=/home/ubuntu/workspace/projects/desktop-commander-selfhost
config="$root/runtime/private/relay.env"
if [ "$(id -un)" != ubuntu ]; then echo 'Run as the authorized ubuntu user'; exit 1; fi
if [ ! -f "$config" ]; then echo 'Missing relay configuration'; exit 1; fi
if ! curl -fsS --max-time 4 http://127.0.0.1:18791/healthz >/dev/null; then echo 'Relay is not healthy'; exit 1; fi
if ! sudo tailscale funnel status | grep -q 'No serve config'; then
  echo 'Tailscale Serve/Funnel already has a configuration; will not overwrite another project.'; exit 2
fi
fqdn="$(tailscale status --json | python3 -c 'import sys,json; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')"
case "$fqdn" in *.ts.net) ;; *) echo 'Unexpected Tailscale DNS suffix'; exit 1;; esac
url="https://$fqdn"
# Refuse if an admin has not yet enabled Funnel rather than changing other settings.
if ! timeout -k 3s 15s sudo tailscale funnel --bg --yes --https=443 http://127.0.0.1:18791; then
 echo 'Tailscale Funnel needs tailnet administrator approval. No relay URL was changed.'; exit 3
fi
python3 - "$config" "$url" <<'PY'
import os,sys
f,url=sys.argv[1:]
text=open(f).read()
lines=text.splitlines()
assert any(x.startswith('KARIS_PUBLIC_URL=') for x in lines)
text='\n'.join('KARIS_PUBLIC_URL='+url if x.startswith('KARIS_PUBLIC_URL=') else x for x in lines)+'\n'
tmp=f+'.updated'
fd=os.open(tmp,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
with os.fdopen(fd,'w') as out: out.write(text)
os.replace(tmp,f)
PY
sudo systemctl restart karis-mcp-relay.service karis-mcp-agent.service
sleep 2
curl -fsS --max-time 10 "$url/.well-known/oauth-authorization-server" >/dev/null
printf '\nMCP endpoint: %s/mcp\nSettings: %s/settings\n' "$url" "$url"
