# Karis Control

**MCP tự lưu trữ, quản lý nhiều thiết bị — phát triển độc lập bởi Karis-tlg.**

Dựa trên phần mã nguồn [Desktop Commander MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP) (MIT), nhưng **không sử dụng máy chủ hoặc tài khoản Desktop Commander thương mại**. GitHub `main` của dự án này là nguồn phát triển chính; `upstream` chỉ để tham khảo các bản vá phù hợp.

## Bắt đầu nhanh — chỉ 3 bước

**Yêu cầu:** Máy cần kết nối có [Node.js 22.12+](https://nodejs.org/en/download) và truy cập Internet. Không cần clone repository, cài plugin thủ công hay sửa file cấu hình.

1. **Kết nối ChatGPT hoặc AI client:** thêm remote MCP `https://panel-rs.tail79e063.ts.net/mcp` vào ứng dụng, hoàn thành xác thực OAuth một lần. Đây là URL cho AI, **không** phải URL ghép nối thiết bị.
2. **Mở [Karis Control](https://panel-rs.tail79e063.ts.net/dashboard):** đăng nhập quản trị, chọn **Thêm thiết bị** hoặc **Quản lý → Kết nối** trên thiết bị có sẵn.
3. **Bấm Sao chép lệnh**, dán **nguyên lệnh** vào PowerShell/CMD (Windows) hoặc Terminal (Linux/macOS) trên máy cần kết nối. Chạy lệnh và giữ terminal mở. Khi thiết bị hiện **Trực tuyến**, bạn đã hoàn thành.

Karis Control tự tạo **một lệnh** chứa gói agent đã đóng gói sẵn, địa chỉ server và **khóa ghép nối tạm thời**. Không phải tự tìm token, tạo file `.env` hay nhập nhiều bước. Một ví dụ minh họa (token là giá trị giả, **không chạy trực tiếp**):

```sh
npx -y -p https://github.com/Karis-tlg/DesktopCommanderMCP/releases/download/selfhost-v0.3.4-karis.5/karis.tgz desktop-commander remote https://panel-rs.tail79e063.ts.net/pair/<YOUR_PAIRING_KEY>
```

**Windows:** dashboard tự dùng `npx.cmd` thay `npx`. Nếu máy chưa có Node.js, cài Node.js LTS trước và mở lại terminal. Chỉ chạy lệnh lấy trực tiếp từ dashboard của **bạn**; khóa có thời hạn và không nên gửi cho người khác. Nếu terminal đóng, mở lại lệnh đã lưu trong máy hoặc lấy lệnh ghép nối mới từ dashboard. Khóa vừa cấp chỉ được lưu dạng hash trên server và chỉ thay thế khóa đang dùng khi máy mới kết nối thành công.

**Không cần cài agent lại khi bạn chỉ muốn dùng ChatGPT trên thiết bị đã kết nối.** Chỉ cần kết nối MCP trong ứng dụng AI.

### Các lệnh kiểm tra ngắn

```sh
node --version
npx --version
```

Nếu máy hiển thị `node: command not found` hoặc phiên bản thấp hơn 22.12, hãy cài Node.js. Nếu thông báo lỗi `401` khi ghép nối, lấy lại lệnh trong dashboard và kiểm tra khóa đã hết hạn hay đã bị thu hồi. **Đừng gửi token, password, private link hoặc log chưa che thông tin nhạy cảm lên issue/chat.**

## Máy chủ và đóng gói

Phần trên dành cho **thiết bị client** kết nối đến host Karis đang chạy. Với **VPS Linux mới**, bộ cài Panel + MCP Host + Agent đã được gộp thành một lệnh (cần Node.js 22.12+, Git, sudo và Tailscale đã đăng nhập):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Karis-tlg/DesktopCommanderMCP/main/deploy/install-host.sh) --tailscale
```

Nếu đã có domain/reverse proxy HTTPS, thay `--tailscale` bằng `--url https://mcp.example.com`. Installer tự tạo khóa, file cấu hình, service và kiểm tra sức khỏe; không ghi đè dịch vụ có sẵn. Xem [hướng dẫn cài host](deploy/README.md) và [vận hành](KARIS-SELFHOST.md). Bạn nên xem nội dung script trước khi cấp quyền sudo.

Mã nguồn:

| Đường dẫn | Chức năng |
|---|---|
| `selfhost/relay.mjs` | MCP/OAuth relay và thiết bị |
| `selfhost/dashboard.mjs` | Dashboard, quản trị và ghép nối |
| `selfhost/agent.mjs` | Agent chạy trên máy tính |
| `selfhost/controllers.mjs`, `startup.mjs` | Browser/Windows controller và tự khởi động |
| `selfhost/audit.mjs` | Tóm tắt hoạt động đã lọc nội dung nhạy cảm |
| `src/`, `dist/` | MCP tools (nguồn + đầu ra build) |

### Phát triển và kiểm thử

Cần Node.js 22.12+. Trong thư mục repository:

```sh
npm ci --ignore-scripts
npm run build
node selfhost/test-audit.mjs
node selfhost/test-dashboard-ui.mjs
node selfhost/test-multi-device.mjs
```

Bài test dashboard và MCP dùng relay/cổng/khóa thử nghiệm cô lập, không được trỏ vào production. Package release phải chứa `dist/index.js` và đủ `dist/selfhost/{agent,controllers,startup,windows-ui}.mjs`; kiểm tra trước khi phát hành.

## Git và bản quyền

- `origin`: [Karis-tlg/DesktopCommanderMCP](https://github.com/Karis-tlg/DesktopCommanderMCP) — **chỉ `main`** là nhánh phát triển lâu dài.
- `upstream`: [wonderwhy-er/DesktopCommanderMCP](https://github.com/wonderwhy-er/DesktopCommanderMCP) — **chỉ để đọc/tham khảo**, không tự merge hoặc push.
- Khác với code độc lập, nhãn “forked from” trên giao diện GitHub là cấu hình của fork network và không ảnh hưởng tới việc sử dụng Karis.

Bản phát hành Karis được tạo riêng trên GitHub, **không sử dụng pipeline xuất bản npm/MCP Registry của upstream**. Giữ các thông báo bản quyền gốc theo [LICENSE](LICENSE). Lưu khóa, DB và profile agent bên ngoài Git. Đọc [SECURITY.md](SECURITY.md) và [KARIS-SELFHOST.md](KARIS-SELFHOST.md) trước khi thay đổi quyền hoặc deploy production.
