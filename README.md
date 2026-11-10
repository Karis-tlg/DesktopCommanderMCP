# Karis Control

**A self-hosted MCP control plane for trusted AI clients and your devices.**

Karis Control lets you connect an AI application to file, terminal, and device-management tools running on computers you control. A private MCP relay handles OAuth, an administration dashboard manages devices and access, and lightweight agents connect Linux, Windows, and macOS machines.

Karis Control is an **independently maintained, community-oriented downstream project** built on the MIT-licensed [Desktop Commander MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP). It is not an official Desktop Commander release and does not require the upstream hosted service.

[**Get started**](#quick-start) · [**Latest release**](https://github.com/Karis-tlg/DesktopCommanderMCP/releases/latest) · [**Host installation**](deploy/README.md) · [**Contributing**](CONTRIBUTING.md) · [**Security**](SECURITY.md)

## What you can do

- **Use a remote MCP endpoint.** Connect supported AI clients using OAuth instead of exposing a local MCP server directly to the internet.
- **Manage multiple devices.** Pair and revoke agents, see whether they are online, and direct supported tool calls to a specific device.
- **Work with local tools.** Use file operations, terminal sessions, searches, processes, and available platform-specific controllers through the connected agent.
- **Manage access from a dashboard.** View authorized clients, device status, usage statistics, and concise activity records.
- **Host your own infrastructure.** Run the relay, dashboard, and an optional local VPS agent on a Linux server you administer.
- **Keep an auditable operational trail.** Activity summaries are intentionally redacted; the relay does not use them to store raw prompts, shell commands, file contents, or pairing secrets.

> [!IMPORTANT]
> Karis Control grants powerful access to connected machines. Use it only with AI clients and users you trust. OAuth, device pairing, and command restrictions are **not substitutes for operating-system isolation**. See [Security](SECURITY.md).

## How it works

```text
Trusted AI client
       |
       | HTTPS / MCP + OAuth
       v
  Karis Control relay ─── Administration dashboard
       |
       | Authenticated device connections
       +── Linux / VPS agent
       +── Windows agent
       +── macOS agent
                |
                v
         Local MCP tools
```

You host the relay and own the connected machines. The dashboard is an administration interface; the `/mcp` endpoint is what AI clients connect to.

## Quick start

### 1. Set up a host

For a **new Linux server**, install [Node.js 22.12+](https://nodejs.org/en/download), npm, Git, and curl. Use a regular Linux account with sudo privileges. Choose one HTTPS option:

**Tailscale Funnel** (Tailscale must already be installed, authenticated, and authorized for Funnel):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Karis-tlg/DesktopCommanderMCP/main/deploy/install-host.sh) --tailscale
```

**Your own domain** (HTTPS and a reverse proxy must already be configured):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Karis-tlg/DesktopCommanderMCP/main/deploy/install-host.sh) --url https://mcp.example.com
```

The installer checks for existing Karis services, asks for confirmation, builds the project, creates private credentials, configures the relay and local agent, and verifies health. It will **not** overwrite existing Karis installations or unrelated Tailscale routes. Review any downloaded script before executing it with administrative privileges.

For prerequisites, preflight checks, custom ports, and limitations, see the [host installation guide](deploy/README.md). Existing manually configured deployments should follow a separate migration plan, **not** the fresh-host installer.

### 2. Connect an AI client

Add this remote MCP server URL to a supported client:

```text
https://<your-host>/mcp
```

Complete the OAuth authorization and approve only clients you trust. The installer displays your actual MCP endpoint.

### 3. Pair another computer

1. Open `https://<your-host>/dashboard` and sign in as the host administrator.
2. Add a device or open its **Connect** action.
3. Select **Copy command**, then paste the generated command into PowerShell / Command Prompt (Windows) or Terminal (Linux/macOS).

The command includes the pinned Karis agent release, relay address, and a **short-lived pairing credential**. Do not share it. Keep the terminal running, or configure supported automatic startup after pairing.

**Device requirements:** Node.js 22.12+ and network access to the relay. You do **not** need to clone this repository or manually create an agent configuration file. The dashboard generates `npx.cmd` for Windows and `npx` for Linux/macOS.

The agent package is distributed through [GitHub Releases](https://github.com/Karis-tlg/DesktopCommanderMCP/releases); **do not assume `@karis-tlg/desktop-commander` is published on npm**.

## Manage your installation

On hosts installed with the new installer:

```bash
~/.local/bin/karis status
~/.local/bin/karis doctor
~/.local/bin/karis update --dry-run
~/.local/bin/karis update --yes
~/.local/bin/karis rollback --yes
```

Updates build a candidate release, back up the managed configuration, perform health checks, and can revert to the previous version. Service-changing commands require explicit approval and the host operator's sudo permissions. These commands do not automatically manage older, manually installed Karis deployments.

See [Host installation and operations](deploy/README.md) and [Self-host operations reference](KARIS-SELFHOST.md).

## Build from source

Requires Node.js 22.12+ and npm.

```bash
git clone https://github.com/Karis-tlg/DesktopCommanderMCP.git
cd DesktopCommanderMCP
npm ci --ignore-scripts
npm run build
```

Run the relevant checks before opening a pull request:

```bash
node selfhost/test-audit.mjs
node selfhost/test-multi-device.mjs
node selfhost/test-dashboard-ui.mjs
node deploy/test-host-setup.mjs
```

The host lifecycle and MCP tests create **isolated test environments** and should not be aimed at your production relay. The host test can take time and disk space while installing dependencies.

## Project layout

| Location | Purpose |
| --- | --- |
| [`selfhost/relay.mjs`](selfhost/relay.mjs) | MCP relay, OAuth, routing, and connection lifecycle |
| [`selfhost/dashboard.mjs`](selfhost/dashboard.mjs) | Administration endpoints and device pairing |
| [`selfhost/agent.mjs`](selfhost/agent.mjs) | Device-side agent |
| [`selfhost/audit.mjs`](selfhost/audit.mjs) | Redacted activity metadata |
| [`deploy/`](deploy/) | Host bootstrap, lifecycle commands, and deployment documentation |
| [`src/`](src/) | Core MCP tooling derived from Desktop Commander |
| [`test/`](test/) and [`selfhost/test-*.mjs`](selfhost/) | Automated and integration tests |

## Security and privacy

This software can execute commands and access files under the permissions of the agent's operating-system account. Restrict who can authorize MCP clients, keep credentials private, and isolate high-risk environments with dedicated users, containers, or virtual machines.

The activity dashboard is an operational aid, **not a complete security audit**. Host administrators remain responsible for TLS, backups, updates, and protecting device and OAuth credentials.

Read the [security model and vulnerability reporting guidance](SECURITY.md) and [privacy documentation](PRIVACY.md) before deployment. **Never include tokens, password files, or unredacted logs in public posts or pull requests.**

## Community and contributing

Contributions are welcome: reproducible bug fixes, tests, documentation improvements, accessibility work, and narrowly scoped features. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

Use [Pull Requests](https://github.com/Karis-tlg/DesktopCommanderMCP/pulls) to propose and discuss changes. **Issues and Discussions are not currently enabled** on this repository; please do not assume those channels are available. For potential vulnerabilities, follow the [security reporting guidance](SECURITY.md) rather than sharing exploit details publicly.

The `main` branch is the maintained integration branch. Upstream Desktop Commander changes are reviewed selectively rather than merged automatically.

## License and acknowledgements

Karis Control is distributed under the [MIT License](LICENSE).

It incorporates work from [Desktop Commander MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP), originally developed by Eduard Ruzga and contributors. Original copyright and license notices remain in place. Thanks to the upstream maintainers and everyone contributing to the tools and community.

Karis Control is maintained independently by [Karis-tlg](https://github.com/Karis-tlg). It is **not affiliated with or endorsed by** the upstream Desktop Commander project.
