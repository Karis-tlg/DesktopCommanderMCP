# Karis Control — Self-Host Operations Reference

This document is for administrators of the Karis Control relay and dashboard. For an overview and user setup, see the [README](README.md). For **new Linux installations**, start with the [host installation guide](deploy/README.md).

> [!CAUTION]
> Do not run the fresh-host installer on a server that already has a Karis deployment. It intentionally refuses to replace existing Karis systemd units. Plan and back up any migration of a manually configured host separately.

## System components

A Karis deployment can include:

- **Relay and dashboard:** `selfhost/relay.mjs`, which exposes OAuth/MCP and authenticated device management.
- **Local VPS agent:** `dist/index.js remote --no-save`, which connects over an authenticated WebSocket.
- **Private runtime data:** device state, credentials, and environment configuration stored outside the Git repository.
- **HTTPS entry point:** Tailscale Funnel or a reverse proxy forwarding public HTTPS requests to a loopback-only relay.

A typical installed system exposes:

```text
https://your-host.example/dashboard    # Administrative UI
https://your-host.example/mcp          # OAuth-protected MCP endpoint
http://127.0.0.1:18791                # Relay loopback listener (not public)
```

These addresses are examples; use the endpoints displayed by your own host installation.

## Install a new Linux host

Prerequisites: Node.js 22.12+, npm, Git, Bash, curl, systemd, sudo access from a non-root account, and HTTPS via Tailscale Funnel or an existing reverse proxy.

With Tailscale already authenticated and Funnel authorized:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Karis-tlg/DesktopCommanderMCP/main/deploy/install-host.sh) --tailscale
```

With your own HTTPS domain and configured reverse proxy:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Karis-tlg/DesktopCommanderMCP/main/deploy/install-host.sh) --url https://your-host.example
```

Review the installer before execution. The installer generates private credentials, checks service conflicts, builds the source, configures systemd, and verifies local health. It does not install/configure your domain proxy, change firewall rules, or replace existing networking routes.

See [Host installation](deploy/README.md) for preflight checks, custom ports, and troubleshooting.

## Managing an installer-managed host

```bash
~/.local/bin/karis status
~/.local/bin/karis doctor
~/.local/bin/karis update --dry-run
~/.local/bin/karis update --yes
~/.local/bin/karis rollback --yes
```

The installer keeps active releases under `~/.local/share/karis-control/current`, previous builds under `releases/`, and private files under `private/`. Updates and rollback can change only managed Karis services after explicit approval and sudo authorization.

On a manually deployed legacy host, these commands may not apply. Use the existing service-management procedure appropriate to that deployment; do **not** assume service names or filesystem locations are universally identical.

## Service inspection

On a system using the default Karis systemd unit names:

```bash
sudo systemctl status karis-mcp-relay.service karis-mcp-agent.service
curl -fsS http://127.0.0.1:18791/healthz
journalctl -u karis-mcp-relay.service -u karis-mcp-agent.service -n 80 --no-pager
```

Service logs may contain operational details; redact sensitive information before sharing them.

The legacy helper `deploy/restart-selfhost.sh` restarts **both** Karis services. Avoid using it when only a relay restart is necessary, and never restart production simply to run tests.

## Configuration and secrets

The relay's configuration includes the following environment variable names:

| Variable | Meaning |
| --- | --- |
| `KARIS_PUBLIC_URL` | External HTTPS origin for OAuth and dashboard |
| `KARIS_BIND`, `KARIS_PORT` | Internal listening interface and port |
| `KARIS_DB_FILE` | Persistent local device and OAuth state |
| `KARIS_ADMIN_FILE` | Private administrator credential file |
| `KARIS_AGENT_FILE` | Private local agent credential file |
| `KARIS_LINK_KEY_FILE` | Private link credential file |
| `KARIS_AGENT_PACKAGE_URL` | Pinned GitHub release package used for pairing commands |

Credentials should be independent and randomly generated, with owner-only filesystem permissions. Never copy credentials from another host or commit runtime files. Changing `KARIS_PUBLIC_URL` affects OAuth identity and must be planned and tested.

## Release packaging

To build from source:

```bash
npm ci --ignore-scripts
npm run build
node selfhost/test-audit.mjs
node selfhost/test-multi-device.mjs
node selfhost/test-dashboard-ui.mjs
node deploy/test-host-setup.mjs
npm pack --dry-run
```

The agent release must contain `dist/index.js` and `dist/selfhost/{agent,controllers,startup,windows-ui}.mjs`. Releases are distributed independently via [Karis GitHub Releases](https://github.com/Karis-tlg/DesktopCommanderMCP/releases). Do not publish under upstream Desktop Commander credentials or assume an npm registry package exists.

## Security checklist

- Keep the relay bound to loopback; terminate TLS at a trusted HTTPS entry point.
- Enable OAuth and dashboard authentication; authorize only trusted AI clients.
- Run agents as minimally privileged users or within isolated environments.
- Back up state and credentials securely before updates.
- Confirm both relay and agent health before declaring a deployment successful.
- Do not confuse command restrictions or activity summaries with an OS security boundary.

Refer to [Security](SECURITY.md), [Privacy](PRIVACY.md), and [Contributing](CONTRIBUTING.md).
