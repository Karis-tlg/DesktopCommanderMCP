# Quyền riêng tư — Karis Control self-hosted

**Karis Control** là dự án phát triển độc lập, sử dụng các công cụ mã nguồn mở của Desktop Commander theo MIT. Văn bản này mô tả tính năng **relay và agent self-hosted** của Karis, không phải dịch vụ Desktop Commander thương mại.

## Dữ liệu đi qua hệ thống

Khi một ứng dụng AI được bạn cấp quyền qua OAuth, relay chuyển yêu cầu MCP đến thiết bị mà bạn ghép nối. Yêu cầu có thể bao gồm tên file, đường dẫn, lệnh terminal và dữ liệu được ứng dụng AI gửi để thực hiện tác vụ. **Vì vậy quản trị viên và thiết bị có quyền cao phải được tin cậy**. Nội dung yêu cầu/phản hồi được xử lý trong bộ nhớ khi thực hiện tác vụ; một số tool, ứng dụng, hệ điều hành hoặc lệnh do người dùng chạy có thể tự tạo log độc lập.

Karis relay lưu cục bộ trên VPS cấu hình thiết bị, thông tin client OAuth, token truy cập dạng hash, trạng thái và bộ đếm lượt gọi. Audit cho từng thao tác chỉ lưu tên tool, thiết bị, ứng dụng gọi, trạng thái, thời điểm, thời gian xử lý và tóm tắt loại tác vụ đã giới hạn thông tin. Nó không chủ đích lưu **prompt, lệnh shell thô, đường dẫn tệp hoặc nội dung file** trong lịch sử hoạt động; bản ghi audit tối đa **300 mục trong 14 ngày**. Một số hệ thống báo lỗi bên ngoài vẫn có thể lưu thông tin riêng.

Khóa ghép nối và OAuth được tạo riêng cho từng client/thiết bị. Server lưu hash các khóa thiết bị trong cơ sở dữ liệu local; lệnh kết nối có khóa dùng một lần/giới hạn thời gian được hiển thị cho quản trị viên trong phiên đăng nhập, do đó cần bảo vệ khỏi ảnh chụp hoặc chia sẻ nhầm. Mật khẩu quản trị và file `.env` được lưu **ngoài repository** trong vùng có quyền truy cập hạn chế.

Agent self-hosted khởi tạo local MCP với biến `DESKTOP_COMMANDER_DISABLE_TELEMETRY=1` và `KARIS_DISABLE_TOOL_HISTORY=1`, để tránh thu thập telemetry/tool history từ phần local MCP phát sinh trong tác vụ remote. Nếu bạn chạy **local Desktop Commander độc lập** hoặc phần mềm bên thứ ba, hãy kiểm tra chính sách và cấu hình của các thành phần đó; chúng không tự được bao phủ bởi các biến môi trường của relay Karis.

## Kiểm soát

- Quản trị viên dashboard có thể xem lịch sử tóm tắt, danh sách client được cấp quyền, ghép nối và thu hồi thiết bị, xóa hoặc thu hồi OAuth client theo chức năng cung cấp.
- Người điều hành máy chủ chịu trách nhiệm lưu giữ, sao lưu và xóa dữ liệu máy chủ trong `runtime/private` theo chính sách riêng, không dựa vào việc xóa branch hoặc commit Git.
- HTTPS/TLS nên được bật ở reverse proxy. Không cấp quyền MCP cho ứng dụng hoặc tài khoản không đáng tin cậy.
- Để hỏi hoặc báo vấn đề, dùng [GitHub Issues](https://github.com/Karis-tlg/DesktopCommanderMCP/issues), **không đăng token, file cấu hình hoặc log chứa dữ liệu nhạy cảm**.

Code gốc Desktop Commander có giấy phép và tài liệu riêng: [Desktop Commander MCP](https://github.com/wonderwhy-er/DesktopCommanderMCP). Karis không đại diện cho nhà phát triển upstream.
