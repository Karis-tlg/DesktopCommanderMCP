# Karis private Desktop Commander MCP — self-host preview

This project forks the MIT-licensed `@wonderwhy-er/desktop-commander` local MCP **and adds our own** self-hosted OAuth relay, WebSocket agent and a Streamable HTTP `/mcp` endpoint. It is not the proprietary Desktop Commander hosted service.

## What works today

- VPS relay via `selfhost/relay.mjs`, plus agent via `desktop-commander remote`.
- MCP Streamable HTTP server, dynamic client registration, OAuth authorization-code + PKCE (S256), per-client bearer/refresh tokens, revocation, RFC 9728 resource metadata, approval password UI, client revocation at `/settings`.
- A separate **single-link mode** at `/mcp/<random-secret>` lets a client connect without an OAuth pop-up. The secret is embedded in the URL and acts as a bearer credential; anyone who obtains the URL can run the full tool set. Keep it private and rotate it if shared.
- Agent pairing via separate strong secret (`/agent` WebSocket) and a local MCP child process with file and terminal tools. Both the agent and relay restart with systemd on VPS.
- No artificial 10,000-tool-calls/month limit in this self-host. Vendor dashboard counters remain separate.
- Default third-party telemetry, vendor flags and tool-call recording are disabled. Agent child uses separate HOME so existing Desktop Commander settings are not touched.
- Built and tested with 25 MCP tools, `get_config` over HTTPS → WS → local MCP, OAuth/PKCE, refresh rotation/revocation, plus a link-only client with no Authorization header.

## Hosted VPS status

- Relay local URL: `http://127.0.0.1:18791/mcp` (bind 127.0.0.1 only).
- `karis-mcp-relay.service` and `karis-mcp-agent.service` are enabled and running; secrets in `../runtime/private/` (owner-only files; **do not commit**).
- Tailscale Funnel is enabled. Public origin: `https://panel-rs.tail79e063.ts.net`. Standard OAuth endpoint: `/mcp`. Single-link endpoint: `/mcp/<private-link-key>`; the exact key is stored only in `../runtime/private/link.key` and is intentionally not in Git.
- Tailscale HTTPS exposure is public; protect your admin password, agent pairing key and OAuth tokens. Only approve known clients. Consider client write/shell capabilities extremely privileged.

## Install an agent on another Windows / Linux / macOS computer

The fork is not yet published on the npm registry (npm credentials are not configured on this VPS). The GitHub Release offers an npm tarball usable by **one npx command**:

```bash
npx --yes --package=https://github.com/Karis-tlg/DesktopCommanderMCP/releases/download/v0.3.2-karis.1/karis-tlg-desktop-commander-0.3.2-karis.1.tgz desktop-commander remote
```

On first launch, paste **your own public HTTPS `/mcp` URL** and the **pairing key** stored in `../runtime/private/agent.key`. The agent stores its own credentials locally under `~/.karis-desktop-commander-agent/config.json` with restrictive permissions. It does **not** connect to `mcp.desktopcommander.app`.

A normal `npx @karis-tlg/desktop-commander@latest remote` requires publishing to npm under a verified, authorized npm account; GitHub fork/release alone cannot reserve the npm scope.

For an already-cloned project:

```bash
npm ci --ignore-scripts
npm run build
node dist/index.js remote --endpoint https://your-host/mcp
```

## Add to an MCP client

**Simplest setup (no OAuth pop-up):** choose `No authentication` in the MCP client and paste the private single-link endpoint `https://panel-rs.tail79e063.ts.net/mcp/<PRIVATE-LINK-KEY>`. The link key is embedded in the URL, so there is no second login step. Keep the URL secret; it grants full terminal/file tools. The key is in `../runtime/private/link.key`; rotate it by replacing that file with a fresh random key, then restart `karis-mcp-relay.service` and update the client URL.

**Alternative:** configure `https://panel-rs.tail79e063.ts.net/mcp` with OAuth. On first authorization the server shows an approval page; enter the private admin approval password stored in `../runtime/private/admin.key`. Settings are at `https://panel-rs.tail79e063.ts.net/settings`; OAuth clients can be revoked there or via `/revoke`.

## VPS operations

```bash
sudo systemctl status karis-mcp-relay karis-mcp-agent
sudo systemctl restart karis-mcp-relay karis-mcp-agent
sudo systemctl stop karis-mcp-agent karis-mcp-relay
journalctl -u karis-mcp-relay -u karis-mcp-agent -n 80 --no-pager
```

Only stop the above two dedicated services. Do not stop other projects. The HTTPS mapping, if enabled, is owned by `tailscaled` and can be turned off with the matching `tailscale funnel --https=443 off` command; check `tailscale funnel status` before changing it.

## Code safety caveats

This is an independently operated **preview** and has not undergone a full security audit or multi-device stress test. The OAuth/relay state uses a single-process owner-only JSON file; do not run multiple relay instances pointing to that file. Clients must be trusted because file/shell tools execute with the device user's OS privileges. Production hardening should include per-device path isolation, more explicit approval of high-risk tools, secure backup of token state, systemd security restrictions, rate limits and a reviewed update channel.

The upstream source is MIT licensed (see LICENSE); the separate `desktop-commander/remote-desktop-commander` manifest repository is proprietary and is not forked into this project.
