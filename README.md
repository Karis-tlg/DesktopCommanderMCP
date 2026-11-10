# Karis Control

**Private, self-hosted MCP workspace and multi-device control panel.**

Karis Control is an **independently maintained downstream project** built from the open-source [Desktop Commander MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP) codebase. Its development, releases and production infrastructure are managed separately by [Karis-tlg](https://github.com/Karis-tlg). This repository is the authoritative source for Karis Control; upstream changes are reviewed and selectively incorporated, never automatically merged.

## Capabilities

- Self-hosted **MCP relay** with OAuth authorization and per-device routing.
- Multi-device Linux / Windows agents, with an authenticated web dashboard.
- Remote file, terminal, search and process-management tools.
- Device registration, revocation and expiring connection commands.
- Compact, redacted MCP activity history and persistent usage statistics.
- Optional browser CDP / Windows UIA controllers, depending on agent capabilities.
- Bounded activity retention without storing raw prompts, shell commands, secrets or file contents.

## Repository layout

| Path | Purpose |
| --- | --- |
| `selfhost/relay.mjs` | MCP relay and device connections |
| `selfhost/dashboard.mjs` | Authenticated dashboard endpoints |
| `selfhost/dashboard-view.mjs` / `dashboard.css` | Dashboard UI |
| `selfhost/agent.mjs` | Remote device agent |
| `selfhost/audit.mjs` | Redacted activity metadata |
| `selfhost/test-dashboard-ui.mjs` | Browser-level dashboard regression tests |
| `selfhost/test-multi-device.mjs` | OAuth, routing and pairing integration tests |
| `src/` | Desktop Commander-derived MCP tooling |
| `deploy/` | Deployment references (review before use) |

## Development

Requires Node.js 22.12 or newer. From the repository root:

```bash
npm ci
npm run build
node selfhost/test-audit.mjs
node selfhost/test-dashboard-ui.mjs
node selfhost/test-multi-device.mjs
```

The dashboard tests use an isolated relay and test credentials. Do not treat the shared VPS as a disposable development machine. Service restarts, production deployments and changes to keys or access control require explicit authorization.

For service configuration and operation, refer to `KARIS-SELFHOST.md` and repository-specific `AGENTS.md`. Never commit `.env` files, pairing tokens, admin keys, production databases or private logs.

## Branches, remotes and upstream review

**`main` is the only permanent development branch.** Short-lived work branches, if required, should be merged and deleted after review. Releases are made explicitly from Karis Control's own repository, not from upstream release workflows.

Local remotes:

- `origin` — `https://github.com/Karis-tlg/DesktopCommanderMCP.git` (owned project; push here).
- `upstream` — `https://github.com/wonderwhy-er/DesktopCommanderMCP.git` (reference-only; never push).

To occasionally inspect upstream changes, without modifying local code:

```bash
git fetch upstream main
git log --oneline main..upstream/main
git diff --stat main..upstream/main
```

Evaluate features and security changes individually; test their impact on the self-hosted relay, dashboard and existing agents before porting them. **Do not run `git merge upstream/main` or automatically sync the fork.**

The inherited `.github/workflows/release.yml` comes from the upstream project. **Do not run it for Karis Control until package publishing and MCP registry targets have been audited and configured specifically for this project.**

## Origin and licensing

Based on [Desktop Commander MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP) by Eduards Ruzga and contributors, under the MIT license. Original copyright notices and license terms remain applicable to the derived code. Karis-specific functionality and maintenance are developed independently; this project is not an official release of upstream Desktop Commander.

If GitHub displays a “forked from” label, that is a GitHub repository-network setting and does not change the independent development workflow. Detaching from that network is a separate, permanent repository-admin action, not a Git command.
