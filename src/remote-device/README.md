# Remote Device Integration Notes

This directory contains remote-device code inherited from the original [Desktop Commander MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP) project.

## Using Karis Control

For Karis's own self-hosted connection workflow, use the agent in [`selfhost/agent.mjs`](../../selfhost/agent.mjs) rather than an upstream hosted Desktop Commander account:

1. Install or access a [Karis host](../../deploy/README.md).
2. Connect a trusted AI client to the host's `/mcp` endpoint and authorize it through OAuth.
3. Sign in to the dashboard, create or select a device, and copy its generated pairing command.
4. Run that command on the target computer with Node.js 22.12+.

The pairing command selects the released Karis agent package and contains an expiring credential. Keep that command private.

## About the inherited source

The TypeScript files here remain part of the broader Desktop Commander-derived codebase for compatibility and development. They are **not** the recommended setup path for the self-hosted Karis relay.

Do not replace Karis's agent with upstream hosted-service launchers merely because their names are similar. Removing or refactoring these modules should follow an import/dependency audit and the relevant integration tests.

For user instructions see the [main README](../../README.md). For development guidelines see [Contributing](../../CONTRIBUTING.md) and [Security](../../SECURITY.md).

Original components retain their applicable [MIT license](../../LICENSE) and attribution.
