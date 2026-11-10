# Legacy Remote Launchers (Upstream)

This directory contains cross-platform installation and launch scripts inherited from the upstream [Desktop Commander MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP) project.

**These scripts are not the recommended Karis Control installers.** They still reference upstream installation and service flows, including packages published under the upstream Desktop Commander name. Running them does **not** provide the same behavior as pairing a device through your own Karis relay.

## Connect a device to Karis Control instead

1. Set up your [Karis host](../../deploy/README.md), or sign in to an existing Karis dashboard.
2. Install Node.js 22.12+ on the target computer.
3. Open the dashboard's device management view and select **Connect**.
4. Copy the complete one-time `npx` / `npx.cmd` command and run it on that computer.

No separate configuration file or upstream Desktop Commander hosted account is required.

See the [main README](../../README.md#quick-start), [Security Policy](../../SECURITY.md), and [Contributing](../../CONTRIBUTING.md).

## Maintainer notes

The legacy scripts are preserved for compatibility, source reference, and regression tests. Do not present upstream commands as official Karis setup instructions or modify the inherited scripts without verifying their actual download targets and privileged installation behavior.

Karis-specific installation is implemented in [`deploy/install-host.sh`](../../deploy/install-host.sh) for a **new Linux relay host** and through the dashboard-generated pairing command for **devices**. These are different workflows.
