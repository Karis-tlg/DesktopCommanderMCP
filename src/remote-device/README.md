# Remote device — lưu ý về kiến trúc Karis

Karis Control sử dụng **agent self-hosted** tại `selfhost/agent.mjs`, không phải dịch vụ đăng nhập `mcp.desktopcommander.app` của Desktop Commander upstream.

Để kết nối máy Windows/Linux/macOS với Karis, làm theo [README.md](../../README.md): thêm endpoint OAuth `/mcp` vào AI app, mở dashboard Karis, tạo thiết bị và **sao chép một lệnh** từ bảng điều khiển lên máy cần ghép nối (Node.js 22.12+).

Các file TypeScript trong thư mục `src/remote-device/` được kế thừa từ dự án Desktop Commander và còn được dùng cho phần hỗ trợ công cụ/CLI hoặc thử nghiệm tương thích. **Không** sử dụng các hướng dẫn đăng nhập hosted vendor cũ để kết nối Karis. Thay đổi kiến trúc/cắt bỏ các module này cần dependency audit và bộ test riêng, không được xóa chỉ vì trùng chức năng với `selfhost/agent.mjs`.

Bản quyền các phần code kế thừa giữ theo [LICENSE](../../LICENSE).
