# Karis Desktop Commander — self-hosted multi-device MCP

This fork keeps the MIT-licensed Desktop Commander local MCP tools and adds an independently implemented self-hosted remote MCP relay, per-device agent credentials, OAuth, and an admin dashboard. The hosted Remote Desktop Commander backend is proprietary; this project reproduces the documented public workflows rather than copying its closed implementation.

## Current feature set

- One Streamable HTTP MCP endpoint at `/mcp`, protected by OAuth 2.0 authorization-code + PKCE, dynamic client registration, refresh/revoke, and protected-resource metadata.
- A self-hosted panel at `/dashboard`: sign in with the private admin password, add a device, create a per-device pairing link, choose a default device, see online/offline and last-seen status, rotate or revoke a device, revoke all devices, and revoke individual OAuth clients.
- Up to 32 registered devices. Each device has its own high-entropy pairing key stored as a hash on the server. Pair links are shown once and can be rotated.
- The local Desktop Commander tool schemas are retained. Tools have an optional `target_device` argument; omit it to use the default device. The remote server adds `list_paired_devices`, `get_current_user_info`, `ping_device`, `shutdown_device_agent`, `get_prompt_library`, `get_recent_tool_activity`, `get_usage_statistics`, and `submit_feedback`, plus aliases for configuration tools. Activity records contain tool/device/status/duration only; tool arguments and file contents are not recorded.
- No hosted vendor 10,000 tool-calls/month quota is enforced by this self-host. The vendor's dashboard/quota is separate and is not changed.
- Agent and relay are separate systemd services on the VPS. Agents reconnect automatically. Device tool calls execute on each computer with that OS user's permissions.

## VPS deployment

- Project: `/home/ubuntu/workspace/projects/desktop-commander-selfhost/`
- Source: `source/`
- Local MCP endpoint: `http://127.0.0.1:18791/mcp`
- Local panel: `http://127.0.0.1:18791/dashboard`
- Port 18791 is bound to loopback only. No firewall or other project's proxy was changed.
- Services: `karis-mcp-relay.service` and `karis-mcp-agent.service`, enabled on boot.
- Secrets: `runtime/private/`, owner-only. Never commit or share the admin password, OAuth tokens, or device pairing links.
- **Public HTTPS is not enabled yet.** Tailscale Funnel requires tailnet-admin approval at https://login.tailscale.com/f/funnel?node=nFQM3KCRwF11CNTRL. After approval, run `cd source && ./deploy/enable-funnel.sh`. The script refuses to overwrite an existing Tailscale Serve/Funnel configuration. Only call the endpoint public after the script and HTTPS checks succeed.

## Connect an AI client

Use the standard endpoint `https://YOUR-HOST/mcp` in ChatGPT, Cursor, VS Code, Claude or another compatible MCP client and complete OAuth once. The endpoint is not available publicly until HTTPS is enabled.

For an additional computer, sign in to `/dashboard`, create a device, and run the one-command install shown in the panel on that computer. The command uses the GitHub Release tarball so it does not require a global install or npm account. The agent pairing URL ends in `/pair/<secret>`; do not paste that URL into the AI connector. It is a device credential, not the OAuth MCP endpoint.

Legacy compatibility: the older account-wide `/mcp/<link-key>` capability endpoint remains enabled for existing clients. Anyone who has that secret URL can access the full tool set without OAuth. Prefer `/mcp` with OAuth for new connections; the old link is not displayed in the new panel.

## Test and build

```bash
cd /home/ubuntu/workspace/projects/desktop-commander-selfhost/source
npm ci --ignore-scripts
npm run build
node selfhost/test-multi-device.mjs
KARIS_TEST_ADMIN_KEY=../runtime/private/admin.key node selfhost/test-relay.mjs
```

The multi-device test starts its own temporary relay on a free loopback port, registers three mock devices plus a real local Desktop Commander agent, verifies core tool routing, activity/usage statistics, ping/shutdown, revocation and cleans its own temporary directory/process. The relay test exercises the deployed VPS agent and OAuth.

## Operations

```bash
sudo systemctl status karis-mcp-relay.service karis-mcp-agent.service
cd source && ./deploy/restart-selfhost.sh
sudo systemctl stop karis-mcp-agent.service karis-mcp-relay.service
journalctl -u karis-mcp-relay.service -u karis-mcp-agent.service -n 80 --no-pager
```

Only operate on these dedicated services; do not stop generic Node/Java/Python processes or other projects. If the VPS agent is revoked or stopped, the panel remains available but VPS tools will be offline until the agent is re-paired/restarted.

## Security notes

This is a self-hosted preview, not an audited production security product. File and shell tools are powerful; authorize only trusted MCP clients. OAuth client tokens and device pairing credentials are independent. Device secrets are stored hashed in the relay registry, while OAuth state is stored in an owner-only JSON file. The server is single-process; do not run multiple relay instances against the same state file. Full cross-platform, load and formal security audits remain outstanding.
