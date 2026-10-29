# Remote Controllers

This self-host build includes 12 Browser Controller tools for Chrome/Edge (CDP) and 10 Desktop Controller tools for Windows (Microsoft WinApp CLI).

## Use
Select the paired device with target_device. On Windows, desktop_status lists window handles. Pass handle to desktop_inspect, desktop_screenshot, desktop_focus, desktop_click, desktop_type, desktop_key, desktop_scroll, desktop_set_value, or desktop_invoke. UI Automation set_value and invoke can work when foreground mouse clicks are unavailable.

Start a dedicated browser with browser_start, then use browser_tabs and browser_new_tab. Navigate, snapshot, click, fill, press keys, scroll, or capture a screenshot by tab_id. Browser profiles remain private to the agent and debugging is restricted to 127.0.0.1. browser_stop stops only an agent-owned process.

On Windows, install @microsoft/winappcli version 0.7.1 under the local KarisRemoteCommander automation-tools folder. The expected executable is node_modules/@microsoft/winappcli/bin/win-x64/winapp.exe.

## Verification
Run node selfhost/test-controller-unit.mjs, node selfhost/test-multi-device.mjs, and npm run build from the project root. On an interactive Windows workstation, run the dedicated selfhost/test-controller-smoke.mjs test with a separate browser profile. This test exercises both controllers.

## Limits
Screenshots in Desktop Controller capture a selected window, not a whole multi-monitor desktop. Windows foreground and lock-screen restrictions remain in effect. Desktop text inputs can be visible briefly in process arguments; do not use desktop_type or desktop_set_value for credentials.
Browser Controller supports Chromium browsers with an active local CDP endpoint; it does not automatically attach to ordinary personal browsing sessions.
MCP clients with an older cached tool list may require reconnecting to see the new tools.
