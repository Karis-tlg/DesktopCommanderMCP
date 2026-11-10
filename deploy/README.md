# Karis Control — cài mới MCP Host + Panel trong một lệnh

Phần này dùng cho **VPS Linux mới**, không phải để nâng cấp dịch vụ Karis đã có. Node.js 22.12+, npm, Git và Bash cần được cài sẵn. Chạy bằng tài khoản Linux thường có quyền sudo; **không chạy installer dưới tài khoản root**.

## Cách ngắn nhất — Tailscale Funnel

Sau khi đã đăng nhập Tailscale và có quyền sử dụng Funnel:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Karis-tlg/DesktopCommanderMCP/main/deploy/install-host.sh) --tailscale
```

Script kiểm tra xung đột, hỏi xác nhận, tải source Karis, build, tự tạo ba khóa riêng, mật khẩu quản trị, file cấu hình, hai service systemd và bật HTTPS Funnel **chỉ khi Tailscale chưa có cấu hình Serve/Funnel**. Không đụng đến SSH, Nginx, firewall hay service của dự án khác. Nếu Funnel chưa được tailnet admin cho phép, installer sẽ báo lỗi thay vì thay cấu hình mạng.

Khi thành công, installer hiển thị URL **Dashboard** (`/dashboard`) và **MCP** (`/mcp`). Mật khẩu quản trị được lưu owner-only ở `~/.local/share/karis-control/private/admin.key` và chỉ in trực tiếp một lần khi có terminal tương tác; không đưa mật khẩu vào log chạy tự động.

## Có sẵn domain HTTPS riêng

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Karis-tlg/DesktopCommanderMCP/main/deploy/install-host.sh) --url https://mcp.example.com
```

**Quan trọng:** lựa chọn này **không** tự cài Nginx/Caddy hoặc cấp chứng chỉ TLS. Trước khi dùng, domain HTTPS của bạn phải được định tuyến tới relay loopback (mặc định `127.0.0.1:18791`) qua proxy do bạn quản lý. Không mở port relay trực tiếp ra Internet. Để đổi cổng loopback, thêm `--port 19421` và trỏ proxy vào đúng cổng.

## Quản lý sau cài

```bash
$HOME/.local/bin/karis status
$HOME/.local/bin/karis doctor
$HOME/.local/bin/karis update --dry-run
$HOME/.local/bin/karis update --yes
$HOME/.local/bin/karis rollback --yes
```

- **status:** phiên bản, URL panel/MCP, service, trạng thái relay.
- **doctor:** Node.js, file runtime, quyền đọc khóa, HTTPS/OAuth và agent.
- **update:** lấy mã nguồn Karis `main`, kiểm tra/build trước khi thay, backup cấu hình và DB, đổi release, khởi động lại **chỉ hai service Karis do installer tạo**, kiểm tra health; nếu hỏng thì tự phục hồi bản trước.
- **rollback:** quay về bản release trước; giữ lại backup để kiểm tra.

Các lệnh thay service yêu cầu `--yes` và sudo của người vận hành. Installer không ghi đè dịch vụ Karis đang có trên VPS chung; muốn chuyển từ bản cài thủ công cũ sang installer mới cần kế hoạch migrate riêng.

## Thử trước khi áp dụng

Đọc script trước nếu cần:

```bash
curl -fsSL https://raw.githubusercontent.com/Karis-tlg/DesktopCommanderMCP/main/deploy/install-host.sh -o karis-install-host.sh
less karis-install-host.sh
bash karis-install-host.sh --tailscale --dry-run
```

Test tự động dành cho developer:

```bash
node deploy/test-host-setup.mjs
```

Test dùng thư mục và cổng riêng, **không đăng ký systemd thật**. Nó kiểm chứng quy trình cài mới, relay/agent nội bộ, quyền khóa, status, doctor, update, no-op update, dry-run, rollback và cleanup. Mọi secret thử nghiệm được tạo ngẫu nhiên trong thư mục tạm.

## Sau khi host hoạt động

Trong ChatGPT, thêm remote MCP `https://<host>/mcp` và hoàn tất OAuth một lần. Trong Dashboard → Thiết bị, sao chép một lệnh `npx` để kết nối thêm Windows/Linux/macOS. Khóa ghép nối chỉ có thời hạn, không đưa lên Git hay gửi công khai.

**Giới hạn:** Bộ installer này không tự cài Node.js, Git, Tailscale, không tự cấp quyền Funnel và không tự cấu hình domain/TLS khác. Những bước này đòi hỏi quyền quản trị hạ tầng; không nên âm thầm vượt qua.
