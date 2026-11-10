# Claude Code Plugin — Upstream Compatibility Assets

This directory contains Claude Code plugin material inherited from [Desktop Commander MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP). It includes agent-oriented skills for terminal work, local files, tooling setup, system health checks, and knowledge-base workflows.

## Karis Control users

The self-hosted Karis Control workflow is **different from installing upstream Desktop Commander**:

1. Install a [Karis relay host](../../deploy/README.md), or use an existing trusted Karis host.
2. Connect your supported AI application to `https://<your-host>/mcp` through OAuth.
3. Pair a computer from the Karis dashboard using its generated `npx` command.

See the [main README](../../README.md) for the actual Karis setup path.

## Plugin scope

The plugin templates and skills here originate from the upstream Desktop Commander ecosystem. They may still reference upstream npm packages or hosted-service behavior. They are preserved as compatibility and development material and **are not an alternative Karis Control installer**. Review their commands and permissions before using them.

Contributions that improve Karis compatibility are welcome; see [Contributing](../../CONTRIBUTING.md), [Security](../../SECURITY.md), and the [MIT License](../../LICENSE).
