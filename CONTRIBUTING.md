# Contributing to Karis Control

Thank you for considering a contribution. Karis Control is a community-oriented, independently maintained project built on the open-source Desktop Commander MCP codebase.

We welcome bug reports, accessibility improvements, documentation fixes, tests, and well-scoped features that make self-hosted MCP management safer and easier to operate.

## Before you start

- Search [existing pull requests](https://github.com/Karis-tlg/DesktopCommanderMCP/pulls) to avoid duplicate work. Issues and Discussions are not currently enabled.
- For a larger change, open a draft pull request describing the motivation and proposed approach before investing significant time.
- Keep PRs focused. Avoid unrelated formatting, broad refactors, or new dependencies without a concrete need.
- Read the [Code of Conduct](CODE_OF_CONDUCT.md) and [Security Policy](SECURITY.md).

**Do not disclose vulnerabilities, passwords, pairing commands, authentication cookies, production files, or private logs in public discussions or pull requests.**

## Development environment

Requirements: Node.js 22.12+ and npm.

```bash
git clone https://github.com/Karis-tlg/DesktopCommanderMCP.git
cd DesktopCommanderMCP
npm ci --ignore-scripts
npm run build
```

Run tests relevant to your change:

```bash
node selfhost/test-audit.mjs
node selfhost/test-multi-device.mjs
node selfhost/test-dashboard-ui.mjs
node deploy/test-host-setup.mjs
```

The host and integration tests use temporary environments, but they still require system resources and downloads. **Do not run test fixtures against a live production relay or production credentials.**

## Submitting a pull request

1. Fork this repository or create a short-lived working branch.
2. Make the smallest change that solves the problem.
3. Add or update tests for new behavior and fix documentation affected by your change.
4. Run `npm run build` and relevant tests.
5. Open a pull request against `main` with the problem, approach, validation, and any limitations.

A useful PR description includes:

- **Why:** user problem, bug, or enhancement, with a reproducible example when possible.
- **What:** important design or behavior changes.
- **Verification:** commands run and their results.
- **Risks:** backward compatibility, security considerations, upgrade or rollback needs.

Please do not include generated `node_modules/`, `dist/`, runtime databases, credentials, caches, or machine-specific settings.

## Architecture and security expectations

Karis has two distinct surfaces:

- **Host/relay:** OAuth authorization, device registration, administration, and MCP routing.
- **Device agents:** commands and file operations under the connected machine user's permissions.

Changes to authentication, device pairing, command execution, persistent data, or deployment scripts deserve extra scrutiny. Preserve credential boundaries, confirmation for destructive operations, and compatibility where practical. Never relax authentication or silently manage unrelated operating-system services for convenience.

The upstream [Desktop Commander MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP) project is a valuable reference; its features should be reviewed and tested individually rather than merged automatically.

## Documentation

Write user-facing documentation in **English** using clear language and verifiable instructions. Prefer short Quick Starts, task-oriented guides, honest prerequisites, and explicit security boundaries over marketing claims. Avoid private hostnames and non-public screenshots in community-facing examples.

## Review and conduct

Maintainers review contributions as time permits; acceptance and release timelines are not guaranteed. Respectful discussion, actionable feedback, and attribution to original authors are expected. See the [Code of Conduct](CODE_OF_CONDUCT.md).

Thank you for helping improve Karis Control.
