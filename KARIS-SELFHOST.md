# Karis Desktop Commander MCP (privacy/self-host prototype)

Based on [DesktopCommanderMCP](https://github.com/wonderwhy-er/DesktopCommanderMCP), MIT license retained.

## Architecture

- Local stdio MCP source and remote device source are open source.
- The official hosted Remote MCP relay/auth service is **not** in this repository.
- `MCP_SERVER_URL` is required to start a remote device on this fork; no automatic connection to the vendor relay.
- Changing `MCP_SERVER_URL` alone does **not** implement OAuth, pairing, MCP HTTP, call queue, or Supabase-compatible realtime.

## Privacy defaults

- Installation tracking removed from npm `postinstall`.
- Default app telemetry disabled; run script also enforces `DESKTOP_COMMANDER_DISABLE_TELEMETRY=1`.
- Network feature flags disabled by default; `KARIS_ALLOW_REMOTE_FLAGS=1` opts into the original flags endpoint (not recommended).
- `trackToolCall` and tool history disabled by default (no argument/result history); explicitly set `KARIS_DISABLE_TOOL_HISTORY=0` to opt in.
- The stdio run script uses a project-local HOME so it cannot overwrite another Desktop Commander installation's config/device session.
- MCP tools still need to be called: removing MCP tool invocation would make the server nonfunctional. This fork removes **call tracking**, not the protocol.

## Build / local stdio

```bash
npm ci --ignore-scripts
npm run build
./scripts/run-private.sh
```

This starts a stdio server for an MCP client; it does not expose a public port. Do not run the agent as root. Treat shell/file tools as highly privileged and restrict access to your client.

## Remote deployment pending

Implement or provide a user-controlled OAuth-protected relay that speaks the expected API/protocol before configuring `MCP_SERVER_URL`. Do not start `remote` against the original vendor service if private ownership is required. No production service is replaced by this prototype.
