# Host installation and operations

This guide covers **new Linux hosts**. For connecting a Windows, macOS, or Linux workstation to an existing host, see the [main Quick Start](../README.md#quick-start).

Karis Control consists of a self-hosted MCP/OAuth relay, an administration dashboard, and a local agent. The installer sets up those components as two systemd services on a Linux machine you control.

## Requirements

- Linux with systemd, Bash, and a **non-root** user that can use `sudo`.
- [Node.js 22.12+](https://nodejs.org/en/download), npm, Git, and curl.
- HTTPS provided either by an existing, authorized **Tailscale Funnel** setup or by a domain and reverse proxy that **you configure**.
- A free local TCP port (default: `127.0.0.1:18791`).

> [!WARNING]
> This is a **fresh-install** tool. It refuses to overwrite existing Karis systemd services or another Tailscale Serve/Funnel configuration. If you already run Karis manually, plan a migration rather than attempting a second installation.

## Option A: Tailscale Funnel

Authenticate Tailscale on the host and confirm your tailnet permits Funnel. Then run:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Karis-tlg/DesktopCommanderMCP/main/deploy/install-host.sh) --tailscale
```

The installer detects the Tailscale hostname, checks existing routes, requests confirmation, builds Karis, creates private credentials, configures and enables the two Karis services, and checks local health. It configures Funnel **only if** no conflicting Serve/Funnel configuration exists.

Tailscale installation, sign-in, and Funnel permissions are **prerequisites**, not silent changes the installer makes for you.

## Option B: Your own HTTPS domain

If you already operate a TLS reverse proxy for your hostname:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Karis-tlg/DesktopCommanderMCP/main/deploy/install-host.sh) --url https://mcp.example.com
```

The installer listens on loopback (`127.0.0.1:18791` by default). You must arrange the HTTPS reverse proxy to forward requests, including WebSocket upgrades, to that port. To use another internal port:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Karis-tlg/DesktopCommanderMCP/main/deploy/install-host.sh) --url https://mcp.example.com --port 19421
```

The installer **does not install Caddy/Nginx, obtain a TLS certificate, edit the firewall, or expose the relay directly to the internet**.

## Review before installation

A remote shell script executes code with the permissions of the current user and may request sudo for the explicitly approved service installation. Review the source before running it:

```bash
curl -fsSL https://raw.githubusercontent.com/Karis-tlg/DesktopCommanderMCP/main/deploy/install-host.sh -o karis-install-host.sh
less karis-install-host.sh
bash karis-install-host.sh --tailscale --dry-run
```

For unattended installation after reviewing the plan, add `--yes`. The installer will not replace services belonging to an existing Karis installation.

## After installation

The installer displays your dashboard and MCP URLs:

| Address | Used by |
| --- | --- |
| `https://<your-host>/dashboard` | Host administrator |
| `https://<your-host>/mcp` | Authorized AI/MCP client |

It generates independent credentials for the administrator, local agent, and device-related links. The credentials and environment files live under `~/.local/share/karis-control/private/`, with owner-only access. The administrator password is shown **once on an interactive terminal**, or can be retrieved privately from `private/admin.key` on the host; do not place it in logs, shell history, tickets, or public discussions.

Pair additional workstations by opening the dashboard and copying their short-lived connection command.

## Operations

The installer adds a `karis` launcher under `~/.local/bin/`. Call it directly if that directory is not in your shell's PATH:

```bash
~/.local/bin/karis status
~/.local/bin/karis doctor
~/.local/bin/karis update --dry-run
~/.local/bin/karis update --yes
~/.local/bin/karis rollback --yes
```

| Command | Purpose |
| --- | --- |
| `status` | Show the current version, endpoints, service states, and local health |
| `doctor` | Check prerequisites, private-file permissions, relay, agent, and public OAuth metadata |
| `update --dry-run` | Build/check an update candidate without switching services |
| `update --yes` | Back up managed state, switch to a new build, and restart only managed Karis services |
| `rollback --yes` | Restore the previous managed release with a health check |

Updates and rollback retain backup copies under the installation directory. They are meant for installations managed by this installer, **not arbitrary or pre-existing systemd services**. Review changes and keep independent backups before important updates.

## Files and services

| Path or service | Responsibility |
| --- | --- |
| `~/.local/share/karis-control/current` | Active release |
| `~/.local/share/karis-control/releases/` | Built releases |
| `~/.local/share/karis-control/private/` | Secret keys, runtime database, and local environment |
| `~/.local/share/karis-control/backups/` | Update/rollback backups |
| `karis-mcp-relay.service` | HTTPS-proxied MCP/OAuth relay and dashboard |
| `karis-mcp-agent.service` | Local VPS agent |

Karis never needs to manage other projects' Nginx, SSH, firewall, Docker, or network services as part of this installer.

## Development and verification

From a source checkout:

```bash
npm ci --ignore-scripts
npm run build
node deploy/test-host-setup.mjs
node selfhost/test-multi-device.mjs
node selfhost/test-dashboard-ui.mjs
```

The host lifecycle test creates its own temporary directory and port, runs the relay and agent, then checks install, status, doctor, update, no-op update, rollback, and cleanup. **It does not register or restart systemd services on the test machine.**

## Limitations and troubleshooting

- **Node.js, Git, or curl missing:** install those prerequisites and restart your terminal.
- **Tailscale configuration exists:** the installer stops rather than overwriting routes. Use a dedicated server or manage networking manually.
- **Custom-domain endpoint unreachable:** check TLS, reverse proxy upstream, and WebSocket forwarding.
- **Agent offline:** run `karis doctor`, check its systemd service, and confirm the relay health endpoint works.
- **Existing Karis services:** do not rerun the fresh-install script over them; use a supported managed update or a deliberate migration plan.
- **Security boundary:** do not mistake a localhost relay, MCP authorization, or a command blocklist for sandboxing. Restrict the agent's OS permissions.

For project-level guidance see [Security](../SECURITY.md), [Privacy](../PRIVACY.md), and [Contributing](../CONTRIBUTING.md).
