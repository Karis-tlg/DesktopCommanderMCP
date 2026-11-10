# Security Policy

Karis Control provides powerful access to devices you control. Its MCP relay, OAuth authorization, and pairing workflow can reduce accidental exposure, but **Karis is not a sandbox for untrusted AI clients or arbitrary commands**.

## Supported versions

Security fixes are targeted at the current maintained `main` branch and its applicable Karis releases. Older releases may not receive backports. Check [GitHub Releases](https://github.com/Karis-tlg/DesktopCommanderMCP/releases) for the latest published agent package.

## Threat model

A device agent can perform file, terminal, search, and process operations with the permissions of its operating-system user. The host relay routes authorized requests; it cannot reliably distinguish a legitimate user request from malicious instructions propagated through an authorized or compromised AI client.

**Trust boundaries:**

| Component | Purpose | Important limitation |
| --- | --- | --- |
| HTTPS and OAuth | Protect transport and authorize AI clients | Do not secure a compromised authorized client |
| Device pairing | Authenticate and identify device agents | Pairing commands contain short-lived credentials |
| Dashboard login and CSRF | Protect administrative operations | Administrator credentials require careful handling |
| Tool restrictions | Reduce accidental unsafe actions | Not an OS-level security boundary |
| Containers, VMs, and OS users | Isolate execution and limit filesystem access | Protection depends on configuration and permissions |

For high-risk tasks, use an isolated VM/container or a dedicated low-privilege OS account. Do not grant an agent access to a whole production server if a restricted test environment will do.

## Deployment recommendations

- Use HTTPS; keep the relay bound to loopback behind a trusted proxy or Tailscale Funnel.
- Enable MFA on connected AI accounts where available.
- Authorize only trusted MCP clients; review and revoke clients and devices you no longer use.
- Keep pairing URLs, passwords, OAuth credentials, cookies, private environment files, and backups out of Git, screenshots, and public logs.
- Use different credentials for each installation, and secure the host filesystem with least-privilege access.
- Review commands and tool permissions before running high-impact changes.
- Keep Node.js and installed dependencies updated, and test a candidate release before production rollout.
- Do not assume dashboard activity summaries replace system, network, or security auditing.

The installer refuses to overwrite existing Karis systemd services and conflicting Tailscale routing. Review its code before installation. It does not automatically manage your firewall or TLS certificates on a custom domain.

## Report a vulnerability

**Please do not open a public issue containing exploit steps, secrets, or details that would endanger deployments.**

**Current reporting status:** GitHub private vulnerability reporting is **not enabled** for this repository. Maintainers should enable it before treating the repository as a fully equipped public security-reporting channel.

If you have a trusted private contact method published by the [maintainer's GitHub profile](https://github.com/Karis-tlg), use it to request a confidential reporting channel. **Do not publish exploit steps or secrets in a pull request** to compensate for the lack of private reporting. If no verified private channel is available, retain the sensitive details until one is established.

A useful private report includes affected versions, reproduction steps, impact, and suggested mitigations, with passwords/tokens removed. Please allow maintainers time to investigate before public disclosure. We do not promise a fixed response or patch schedule.

## License

Karis Control is licensed under [MIT](LICENSE) and includes code derived from [Desktop Commander MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP). This is an independently maintained project; security policies and reporting paths of the upstream project do **not** automatically apply to Karis.

As stated in the MIT License, the software is provided without warranty.
