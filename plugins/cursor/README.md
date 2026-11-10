# Cursor Plugin — Upstream Compatibility Assets

This directory contains Cursor plugin resources inherited from [Desktop Commander MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP). It includes rules and skills for local terminal sessions, file operations, development environments, and knowledge-management workflows.

## Use Karis Control

Karis Control is a separate, independently maintained self-hosted MCP workflow:

1. Set up a [Karis relay host](../../deploy/README.md) or use one managed by someone you trust.
2. Connect a compatible AI client to `https://<your-host>/mcp` through OAuth.
3. Pair the devices you own using the complete command generated in the Karis dashboard.

The [main README](../../README.md) provides the supported setup flow.

## About these files

These templates are part of the upstream-derived plugin ecosystem, not an official standalone Karis installer. Some existing rule or skill content may still refer to upstream npm packages or services. Review it before use; **do not assume installing upstream Desktop Commander automatically connects to your Karis relay**.

For improvements and compatibility changes, see [Contributing](../../CONTRIBUTING.md) and [Security](../../SECURITY.md). License terms and acknowledgements are in [LICENSE](../../LICENSE).
