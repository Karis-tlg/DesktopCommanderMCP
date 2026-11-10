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

## Thiết lập server mới (làm một lần)

Yêu cầu: VPS Linux có Node.js 22.12+, HTTPS domain bạn kiểm soát, quyền cài service, và bộ khóa được tạo bảo mật.

1. Clone repository `Karis-tlg/DesktopCommanderMCP` vào thư mục dự án của bạn. `npm ci --ignore-scripts && npm run build`.
2. Tạo các file owner-only chứa khóa ngẫu nhiên mạnh và URL công khai HTTPS trong cấu hình môi trường. Xem `deploy/systemd/` và `selfhost/relay.mjs` để xác định các biến `KARIS_DB_FILE`, `KARIS_ADMIN_FILE`, `KARIS_AGENT_FILE`, `KARIS_LINK_KEY_FILE`, `KARIS_PUBLIC_URL`. **Không copy khóa từ máy chủ khác.**
3. Cấu hình reverse proxy/TLS vào relay loopback, sau đó cấu hình systemd chỉ cho đúng hai service Karis. Xác minh trạng thái và OAuth. Không expose port relay trực tiếp ra Internet.
4. Mở dashboard, đăng nhập quản trị và tạo thiết bị. Gói agent công khai theo release riêng Karis; biến `KARIS_AGENT_PACKAGE_URL` phải trỏ tới **bản release có đầy đủ agent, controller và startup modules**.

Không thể thu gọn triển khai máy chủ công khai thành một lệnh an toàn mà không xử lý khóa và quyền mạng. Sau lần thiết lập server ban đầu, **mỗi thiết bị mới chỉ cần một lệnh từ dashboard**.

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
