# Karis Desktop Commander — self-hosted multi-device MCP

This fork keeps the MIT-licensed Desktop Commander local MCP tools and adds an independently implemented self-hosted remote MCP relay, per-device agent credentials, OAuth, and an admin dashboard. The hosted Remote Desktop Commander backend is proprietary; this project implements documented public workflows rather than copying its closed implementation.

Current self-host patch release: [selfhost-v0.3.4-karis.2](https://github.com/Karis-tlg/DesktopCommanderMCP/releases/tag/selfhost-v0.3.4-karis.2). Release `selfhost-v0.3.4-karis.1` is superseded; the older tag `v0.3.4-karis.1` is deprecated because it points to an upstream commit that does not include this self-host patch.

## Current feature set in source/patch release selfhost-v0.3.4-karis.2

- One Streamable HTTP MCP endpoint at `/mcp`, protected by OAuth 2.0 authorization-code + PKCE, dynamic client registration, refresh/revoke, and protected-resource metadata.
- Admin panel at `/dashboard`: admin sign-in, add device, per-device pairing link, choose default device, online/offline and last-seen status, rotate/revoke device, revoke all devices, and revoke individual OAuth clients.
- Up to 32 registered devices. Each device has a separate high-entropy pairing key stored as a hash on the server. Pair links are shown once and can be rotated.
- Local Desktop Commander tool schemas are retained. Tools have an optional `target_device` argument; omit it to use the default device. Additional tools include `list_paired_devices`, `get_current_user_info`, `ping_device`, `shutdown_device_agent`, `get_prompt_library`, `get_recent_tool_activity`, `get_usage_statistics`, and `submit_feedback`.
- Activity records include tool, device, status and duration only; arguments and file contents are not recorded.
- Dashboard forms use a random session-bound CSRF token. A mismatched browser `Origin` behind a proxy/webview no longer blocks a legitimate form when its CSRF token is valid; requests with a hostile Origin and no token remain blocked. Regression-tested with a Host-rewriting proxy, missing-token hostile Origin, and valid-token Origin mismatch.
- No hosted vendor 10,000 tool-calls/month quota is enforced by this self-host. The vendor's quota is separate and is not changed.

## VPS deployment

- Project: `/home/ubuntu/workspace/projects/desktop-commander-selfhost/`
- Source: `source/`
- Public HTTPS origin: [https://panel-rs.tail79e063.ts.net](https://panel-rs.tail79e063.ts.net) (Tailscale Funnel is currently ON and proxies to loopback port 18791).
- Panel: [https://panel-rs.tail79e063.ts.net/dashboard](https://panel-rs.tail79e063.ts.net/dashboard)
- MCP endpoint: [https://panel-rs.tail79e063.ts.net/mcp](https://panel-rs.tail79e063.ts.net/mcp)
- Local endpoint: `http://127.0.0.1:18791/mcp`; local panel: `http://127.0.0.1:18791/dashboard`.
- Services: `karis-mcp-relay.service` and `karis-mcp-agent.service`, enabled on boot.
- Secrets: `runtime/private/`, owner-only. Never commit or share the admin password, OAuth tokens, or device pairing links.
- **Live deployment verified (2026-10-29):** the reverse-proxy Origin fix (`6faa04e`) is active. Both Karis services are running; public health reports `ok=true`, `agent=true`, `maxDevices=32`, `pairedDevices=1`, `toolCount=35`, and `quota=none`. The dashboard serves its admin sign-in page, and the relay listens only on `127.0.0.1:18791` behind Tailscale Funnel. The focused integration test now simulates a proxy rewriting `Host`, confirms legitimate dashboard device creation succeeds, verifies that a malicious Origin is still rejected, and revokes the test device during cleanup.

## Restart after future source updates

When deploying future changes, run from a VPS terminal with permission to manage the two named services:

```bash
cd /home/ubuntu/workspace/projects/desktop-commander-selfhost/source
./deploy/restart-selfhost.sh
```

The script restarts only `karis-mcp-relay.service` and `karis-mcp-agent.service`, then checks `/healthz` for the expected 32-device limit and connected agent. The automated service-management action is disabled in the Open VPS Commander policy until its administrator explicitly configures `ALLOW_SERVICE_MANAGE` and `MANAGED_SERVICES`; do not bypass that policy.

## Connect an AI client

Use the MCP endpoint above in ChatGPT, Cursor, VS Code, Claude or another compatible MCP client and complete OAuth once. For each additional computer, sign in to the dashboard, create a device, and run the pairing command shown there. Pairing URLs contain a device credential; do not paste them into the AI connector. Use the `/mcp` OAuth endpoint for AI clients.

Legacy compatibility: the older account-wide `/mcp/<link-key>` endpoint remains enabled for existing clients. Anyone who has that secret URL can access the full tool set without OAuth. Prefer `/mcp` with OAuth for new connections.

## Test and build

```bash
cd /home/ubuntu/workspace/projects/desktop-commander-selfhost/source
npm ci --ignore-scripts
npm run build
node selfhost/test-multi-device.mjs
KARIS_TEST_ADMIN_KEY=../runtime/private/admin.key node selfhost/test-relay.mjs
```

The multi-device test starts an isolated relay on a free loopback port, registers three mock devices plus a real local Desktop Commander agent, verifies core tool routing, activity/usage, ping/shutdown and revocation, then cleans up its own temporary processes/files.

## Operations

```bash
sudo systemctl status karis-mcp-relay.service karis-mcp-agent.service
cd /home/ubuntu/workspace/projects/desktop-commander-selfhost/source && ./deploy/restart-selfhost.sh
journalctl -u karis-mcp-relay.service -u karis-mcp-agent.service -n 80 --no-pager
```

Only operate on these dedicated services; do not stop generic Node/Java/Python processes or other projects. If the VPS agent is revoked or stopped, the panel remains available but VPS tools will be offline until the agent is re-paired/restarted.

## Security and remaining work

This is a self-hosted preview, not an audited production security product. File and shell tools are powerful; authorize only trusted MCP clients. OAuth client tokens and device pairing credentials are independent. Device secrets are stored hashed in the relay registry; state is stored in an owner-only JSON file. The relay is single-process; do not run multiple relay instances against the same state file. Full cross-platform, load and formal security audits remain outstanding. The full upstream suite did not finish because the PDF tests tried to download/launch Chromium in this VPS environment; do not treat that suite as passing.
