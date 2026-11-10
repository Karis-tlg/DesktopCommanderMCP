# Privacy and Data Handling

Karis Control is an independently maintained, self-hosted MCP project. This document describes how its **relay, dashboard, and agent** handle data. It is not a privacy statement for the upstream hosted Desktop Commander service, your AI client, operating-system tools, or third-party software you install.

## What passes through the relay

When you authorize an AI application through OAuth, the Karis relay forwards the MCP calls you approve to a paired device. Those calls can include file paths, terminal commands, text arguments, and tool results. The relay and agents process that information to carry out the requested operation.

**Do not assume that a connected AI application, a shell command, your operating system, or third-party tools will avoid logging data simply because the Karis activity dashboard is redacted.** They may retain their own records under separate policies.

## What Karis stores

The self-hosted relay maintains local operational state such as:

- Device identities, registration and revocation state, and tool availability.
- OAuth client authorizations and session/token metadata.
- Hashed device credentials and relevant authentication state.
- Usage counters and a bounded history of tool activity.

Activity records contain metadata such as the tool, target device, invoking client, status, timestamp, processing duration, and a limited action/result summary. **The activity audit is designed not to persist raw prompts, shell commands, file contents, file paths, or tool response bodies.** This history is capped at **300 entries or 14 days**, whichever limit is reached first, within the relay's normal retention behavior.

These summaries are useful for operations but are **not** a complete security or forensic audit.

## Credentials and local files

Pairing commands contain short-lived device credentials and are intended only for the logged-in administrator. The relay stores device credential hashes; never copy an active pairing command into public documentation, issue reports, screenshots, or chat messages.

On a self-hosted installation, administrator credentials, local agent secrets, environment files, data stores, and backups are maintained by the host operator outside the public repository. Host operators control their own filesystem access, backups, retention, and destruction policies.

A Karis device agent launches its local MCP child process with telemetry and tool-history collection disabled for that process through `DESKTOP_COMMANDER_DISABLE_TELEMETRY=1` and `KARIS_DISABLE_TOOL_HISTORY=1`. These settings do **not** determine the behavior of AI clients or unrelated local applications.

## Your controls and responsibilities

Administrators can manage paired devices and authorized clients using the available dashboard functions, including revocation. The host operator is responsible for the underlying server, logs, backups, TLS, disk permissions, and any additional data collection outside the Karis relay.

Only connect clients you trust, use least-privilege operating-system accounts, and review [Security](SECURITY.md) for guidance on isolating sensitive workloads.

For non-sensitive documentation or privacy improvements, propose changes through [Karis Control Pull Requests](https://github.com/Karis-tlg/DesktopCommanderMCP/pulls). The repository's Issues and Discussions features are not currently enabled. For security-sensitive concerns, follow the [security reporting guidance](SECURITY.md).

## Upstream acknowledgements

Karis incorporates MIT-licensed components from [Desktop Commander MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP), but Karis and upstream are separately maintained. This privacy description applies only to the Karis self-hosted features identified above.
