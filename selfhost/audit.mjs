// Deliberately lossy MCP call audit: never persist prompts, paths, shell
// commands, file contents, URLs, raw tool arguments or raw response bodies.
const descriptions = {
  read_file:'Đọc tệp (đường dẫn ẩn)', read_multiple_files:'Đọc nhiều tệp (đường dẫn ẩn)',
  list_directory:'Liệt kê thư mục (đường dẫn ẩn)', get_file_info:'Xem thông tin tệp (đường dẫn ẩn)',
  start_search:'Tìm kiếm (mẫu tìm kiếm ẩn)', get_more_search_results:'Đọc thêm kết quả tìm kiếm',
  stop_search:'Dừng tìm kiếm', write_file:'Ghi tệp (đường dẫn và nội dung ẩn)',
  edit_block:'Sửa tệp (đường dẫn và nội dung ẩn)', move_file:'Di chuyển tệp (đường dẫn ẩn)',
  create_directory:'Tạo thư mục (đường dẫn ẩn)', start_process:'Chạy lệnh (nội dung lệnh ẩn)',
  interact_with_process:'Tương tác tiến trình (dữ liệu nhập ẩn)', read_process_output:'Đọc kết quả tiến trình (nội dung ẩn)',
  list_processes:'Xem tiến trình', list_sessions:'Xem phiên terminal',
  browser_navigate:'Mở trang web (URL ẩn)', browser_click:'Nhấp trong trình duyệt (selector ẩn)',
  browser_fill:'Nhập nội dung trong trình duyệt (nội dung ẩn)',
  browser_screenshot:'Chụp ảnh trình duyệt (ảnh không lưu trong audit)',
  browser_snapshot:'Đọc giao diện trình duyệt (nội dung ẩn)',
  ping_device:'Kiểm tra kết nối thiết bị', get_config:'Xem cấu hình MCP',
  get_recent_tool_activity:'Xem lịch sử MCP', get_usage_statistics:'Xem thống kê MCP'
};
const safeCounters = new Set(['offset','length','depth','timeout_ms','maxResults','limit','port','maxRows','pid','earlyTermination','ignoreCase']);
export function auditRequest(tool, args = {}) {
  const name = String(tool || '');
  const summary = descriptions[name] || 'Gọi công cụ '+name.replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,64)+' (tham số ẩn)';
  if (!args || typeof args !== 'object' || Array.isArray(args)) return summary;
  const metrics = Object.entries(args).filter(([key,value]) =>
    safeCounters.has(key) && (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 10000000))
    .slice(0,4).map(([key,value])=>key+'='+String(value));
  return summary + (metrics.length ? ' · '+metrics.join(', ') : '');
}
export function auditResponse(result) {
  if (result?.isError === true) return 'Công cụ trả về lỗi (nội dung ẩn)';
  const blocks = Array.isArray(result?.content) ? Math.min(result.content.length,100) : null;
  return blocks === null ? 'Đã nhận phản hồi (nội dung ẩn)' : 'Đã nhận '+blocks+' phần phản hồi (nội dung ẩn)';
}
export function auditError(error) {
  const s = String(error || '').toLowerCase();
  if (/offline|not connected/.test(s)) return 'Thiết bị ngoại tuyến';
  if (/timed? ?out|timeout/.test(s)) return 'Hết thời gian chờ';
  if (/disconnect|connection closed|socket closed/.test(s)) return 'Mất kết nối thiết bị';
  return 'Lỗi công cụ (chi tiết nhạy cảm đã ẩn)';
}
