# Karis Control — vận hành self-hosted

**Ứng dụng độc lập** dựa trên Desktop Commander MCP (MIT). Tài liệu này dành cho người quản trị relay/VPS, **không** dành cho người dùng chỉ muốn ghép nối máy Windows/Linux. Quy trình ghép nối máy: [README.md](README.md).

## Kết nối hiện tại

- Dashboard: `https://panel-rs.tail79e063.ts.net/dashboard`
- MCP OAuth: `https://panel-rs.tail79e063.ts.net/mcp`
- Relay nội bộ: `http://127.0.0.1:18791` sau reverse proxy HTTPS
- VPS project: `/home/ubuntu/workspace/projects/desktop-commander-selfhost/`
- Source: `source/`; dữ liệu production và khóa ở `runtime/private/` (**không commit**)
- Service: `karis-mcp-relay.service`, `karis-mcp-agent.service`

Đây là cấu hình đang dùng trên VPS mẫu, **không mặc định phù hợp với máy chủ mới**.

## Thiết lập server mới (tự động hóa)

Yêu cầu VPS Linux có Node.js 22.12+, npm, Git, Bash, sudo; chọn một trong hai cách HTTPS.

**Nhanh nhất với Tailscale đã đăng nhập và bật Funnel:**

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Karis-tlg/DesktopCommanderMCP/main/deploy/install-host.sh) --tailscale
```

**Nếu đã có domain/reverse proxy HTTPS:**

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Karis-tlg/DesktopCommanderMCP/main/deploy/install-host.sh) --url https://mcp.example.com
```

Installer tạo các khóa ngẫu nhiên, cấu hình relay/agent, service systemd, build source, kiểm tra sức khỏe và in URL panel/MCP. Nó từ chối cài đè dịch vụ Karis/Tailscale hiện có. Mật khẩu quản trị chỉ được lưu ở file owner-only và hiện trong terminal tương tác, không đưa vào log. Với domain riêng, **bạn phải cấu hình TLS và reverse proxy trước** — installer không tự thay Nginx/Caddy.

Sau cài dùng `$HOME/.local/bin/karis status`, `doctor`, `update --yes` hoặc `rollback --yes`. Hướng dẫn đầy đủ, preflight/dry-run và giới hạn an toàn: **[deploy/README.md](deploy/README.md)**.

Đây là quy trình **cho VPS mới**. VPS hiện tại đã có service Karis chạy theo đường dẫn riêng; không dùng installer mới để ghi đè/migrate trực tiếp. Sau lần cài server, kết nối mỗi thiết bị mới bằng một lệnh từ dashboard.

## Kiểm tra và khởi động lại khi được phép

```sh
sudo systemctl status karis-mcp-relay.service karis-mcp-agent.service
curl -fsS http://127.0.0.1:18791/healthz
journalctl -u karis-mcp-relay.service -u karis-mcp-agent.service -n 80 --no-pager
```

Sau khi cập nhật mã nguồn relay, kiểm thử trên cổng riêng trước khi cân nhắc restart production. Quy trình cũ `deploy/restart-selfhost.sh` có thể tác động tới **cả relay và agent**; nếu chỉ thay đổi dashboard/relay thì ưu tiên restart chính xác `karis-mcp-relay.service` bởi người có quyền. Không tự dừng Nginx, Tailscale, SSH, Docker hay các service khác.

## Đóng gói và phát hành

```sh
npm ci --ignore-scripts
npm run build
node selfhost/test-audit.mjs
node selfhost/test-dashboard-ui.mjs
node selfhost/test-multi-device.mjs
npm pack --dry-run
```

Kiểm tra gói cài có `dist/index.js`, `dist/selfhost/agent.mjs`, `dist/selfhost/controllers.mjs`, `dist/selfhost/startup.mjs`, `dist/selfhost/windows-ui.mjs`. Đăng gói theo tag/release độc lập của Karis; không sử dụng `.github/workflows/release.yml` cũ của upstream hay publish sang npm/MCP registry của upstream.

## Lưu ý bảo mật

- Chỉ cho phép ứng dụng MCP đáng tin cậy; quyền file và terminal của agent là quyền user chạy agent.
- Phải bảo vệ dashboard bằng HTTPS, đăng nhập quản trị và CSRF; mọi khóa ghép nối có hạn, không được đưa vào query/log hoặc ảnh chụp.
- Server lưu hash token của thiết bị; DB, profile, cache, secret và bản backup thuộc production, không xóa khi dọn repository.
- Hoạt động MCP được ghi dưới dạng tóm tắt đã lọc nội dung nhạy cảm; không giả định hệ thống thay thế được audit bảo mật đầy đủ.
- Nếu có lỗi kết nối, xác minh Node version, release agent, thời hạn khóa, WebSocket và sức khỏe relay trước khi reset/rotate khóa. Việc cấp lại khóa cho máy đang kết nối cần xác nhận rõ.

Nguồn gốc mã: [Desktop Commander MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP), MIT; dự án Karis tự chịu trách nhiệm thay đổi và phát hành của mình.
