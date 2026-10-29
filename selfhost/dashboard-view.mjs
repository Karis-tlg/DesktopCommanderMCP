import { readFileSync } from 'node:fs';

const stylesheet = readFileSync(new URL('./dashboard.css', import.meta.url), 'utf8');
const esc = v => String(v ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const fmt = n => new Intl.NumberFormat('vi-VN').format(Number(n) || 0);
const clock = value => {
  if (!value) return 'Chưa kết nối';
  const date = new Date(Number(value) * 1000);
  return Number.isNaN(date.valueOf()) ? 'Chưa kết nối' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
};
const ico = (name) => {
  const paths = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="3" width="7" height="7" rx="1.3"/><rect x="3" y="14" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/>',
    monitor:'<rect x="2.5" y="3.5" width="19" height="14" rx="2"/><path d="M8 21h8M12 17.5V21"/>',
    server:'<rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/>',
    laptop:'<rect x="4" y="4" width="16" height="12" rx="2"/><path d="m2 20 2-4h16l2 4H2Z"/>',
    activity:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 1 0 7.07 7.07l1.71-1.71"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    chevron:'<path d="m7 10 5 5 5-5"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    key:'<circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 8-8 2 2-2 2 1.5 1.5-2 2-1.5-1.5-2 2"/>',
    lock:'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
  };
  return '<span class="icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' + (paths[name] || paths.grid) + '</svg></span>';
};
const brand = () => '<div class="brand"><span class="brand-mark">' + ico('grid') + '</span><span><span class="brand-name">KARIS<span style="color:#43d3b7">.</span></span><span class="brand-sub">CONTROL CLOUD</span></span></div>';
const page = (title, cls, contents) => '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>' + esc(title) + '</title><style>' + stylesheet + '</style></head><body class="' + cls + '">' + contents + '</body></html>';

export function renderLoginView(errorMessage = '') {
  return page('Đăng nhập · Karis Control', 'login-body',
    '<div class="login-layout"><div class="login-aside">' + brand() +
    '<h1>Kiểm soát mọi thiết bị.<br>Trong một không gian.</h1>' +
    '<p>Kết nối an toàn tới máy tính và VPS của bạn. Một trung tâm, không giới hạn công cụ theo tháng.</p>' +
    '<div class="login-feature">' + ico('shield') + ' Truy cập riêng tư · OAuth &amp; ghép nối bảo mật</div></div>' +
    '<main class="login-form-wrap"><span class="eyebrow">TRUY CẬP QUẢN TRỊ</span><h2>Chào mừng trở lại</h2>' +
    '<p class="muted">Nhập mật khẩu quản trị để mở trung tâm điều khiển.</p>' +
    (errorMessage ? '<div class="login-error" role="alert">' + esc(errorMessage) + '</div>' : '') +
    '<form method="post" action="/dashboard/login" class="login-form">' +
    '<label for="admin-password">Mật khẩu quản trị<input id="admin-password" name="password" type="password" autocomplete="current-password" placeholder="Nhập mật khẩu của bạn" required></label>' +
    '<button type="submit">Vào dashboard ' + ico('arrow') + '</button></form>' +
    '<div class="login-help">' + ico('lock') + '<span>Mật khẩu không được hiển thị trong trang hay lưu vào trình duyệt.</span></div></main></div>');
}

function deviceRow(d) {
  const platform = /win/i.test(d.platform) ? 'monitor' : /mac|darwin|linux/i.test(d.platform) ? 'laptop' : 'server';
  const id = encodeURIComponent(d.id);
  const form = (action, text, cls='secondary') => '<form method="post" action="/dashboard/devices/' + id + '/' + action + '"><button class="' + cls + '" type="submit">' + text + '</button></form>';
  const protectedNote = d.protected ? '<p class="muted">Thiết bị này đang chạy dịch vụ quản lý. Đổi khóa hoặc thu hồi có thể ngắt kết nối công cụ trên VPS.</p>' : '';
  const revoke = '<details class="danger-zone"><summary>Thu hồi quyền thiết bị…</summary><form method="post" action="/dashboard/devices/' + id + '/revoke"><label class="confirm-label"><input type="checkbox" required> Tôi hiểu thiết bị sẽ mất kết nối</label><button type="submit" class="danger">Xác nhận thu hồi</button></form></details>';
  const manage = '<details class="device-actions"><summary>Quản lý ' + ico('chevron') + '</summary><div class="device-menu">' + protectedNote +
    '<div class="menu-actions">' + (d.isDefault ? '<span class="pill default">Máy mặc định</span>' : form('default', 'Đặt làm mặc định')) +
    form('rotate', 'Tạo khóa ghép nối mới') + '</div>' + revoke + '</div></details>';
  return '<article class="device-row">' +
    '<div class="device-main"><span class="platform-icon">' + ico(platform) + '</span><div><div class="device-name">' + esc(d.displayName || d.alias) + '</div>' +
    '<div class="device-meta"><span>' + esc(d.alias) + '</span><span class="divider-dot">·</span><span>' + esc(d.platform || 'Không rõ hệ điều hành') + '</span></div>' +
    '<div>' + (d.online ? '<span class="pill online">Đang kết nối</span>' : '<span class="pill offline">Ngoại tuyến</span>') +
    (d.isDefault ? ' <span class="pill default">Mặc định</span>' : '') + '</div></div></div>' +
    '<div class="device-side"><div class="tool-count"><strong>' + fmt(d.toolCount) + '</strong><small>Công cụ</small></div>' + manage + '</div>' +
    '<div class="device-meta" style="grid-column:1/-1;padding-left:56px;margin-top:-7px">Hoạt động: ' + esc(clock(d.lastSeen)) + '</div></article>';
}
function activityRow(a) {
  const ok = a.status === 'ok' || a.status === 'success';
  const duration = Number.isFinite(Number(a.durationMs)) ? fmt(a.durationMs) + ' ms' : '—';
  return '<li class="activity-row"><div><div class="activity-name">' + esc(a.tool || 'Tác vụ') + '</div><div class="activity-meta">' + esc(a.device || 'dịch vụ') + ' · ' + (ok ? 'Thành công' : esc(a.status || 'Không rõ')) +
    (a.error ? ' · ' + esc(a.error) : '') + '</div></div><span class="activity-time">' + duration + '</span></li>';
}
function clientRow(c) {
  const clientId = String(c.client_id || '');
  return '<li class="client-row"><div><strong>' + esc(c.client_name || 'MCP client') +
    '</strong><div class="client-id">ID ' + esc(clientId.slice(0, 12)) + '…</div></div>' +
    '<details><summary>Thu hồi…</summary><form method="post" action="/dashboard/clients/' + encodeURIComponent(clientId) +
    '/revoke"><label class="confirm-label"><input type="checkbox" required> Xác nhận</label><button class="danger" type="submit">Thu hồi OAuth</button></form></details></li>';
}

export function renderConsoleView({ list, clients, activities, usageTotal, maxDevices, endpoint, pendingLink, message, csrfToken }) {
  const online = list.filter(x => x.online).length;
  const metrics = [
    ['Thiết bị trực tuyến', online, 'Đang hoạt động', 'activity'],
    ['Đã ghép nối', list.length, 'Tối đa ' + fmt(maxDevices) + ' thiết bị', 'monitor'],
    ['Lượt gọi công cụ', usageTotal, 'Không giới hạn theo tháng', 'grid'],
    ['OAuth clients', clients.length, 'Quản lý quyền truy cập', 'shield']
  ].map(m => '<div class="metric"><div class="metric-top"><span class="metric-label">' + esc(m[0]) + '</span>' + ico(m[3]) +
    '</div><div class="metric-num">' + fmt(m[1]) + '</div><div class="metric-foot">' + esc(m[2]) + '</div></div>').join('');
  let issued = '';
  if (pendingLink) {
    const url = pendingLink.url;
    const command = pendingLink.command;
    issued = '<section class="panel issued" role="status" aria-label="Thông tin ghép nối"><h2>Khóa ghép nối vừa tạo</h2>' +
      '<p><strong>' + esc(pendingLink.displayName) + '</strong> · Đường dẫn riêng tư chỉ hiển thị một lần. Không gửi liên kết cho người khác.</p>' +
      '<label>Liên kết ghép nối</label><div class="secret">' + esc(url) + '</div>' +
      '<label>Lệnh cài đặt trên máy tính</label><div class="secret">' + esc(command) + '</div>' +
      '<p>Chọn đoạn văn bản để sao chép và chạy trên máy bạn muốn kết nối. Thiết bị sẽ xuất hiện ngay sau khi agent kết nối.</p></section>';
  }
  const deviceItems = list.length ? list.map(deviceRow).join('') :
    '<div class="empty">Chưa có thiết bị nào. Dùng biểu mẫu bên phải để tạo liên kết ghép nối đầu tiên.</div>';
  const activityItems = activities.length ? activities.slice(0, 12).map(activityRow).join('') :
    '<li class="empty">Chưa ghi nhận lượt gọi công cụ. Hoạt động mới sẽ xuất hiện tại đây.</li>';
  const clientItems = clients.length ? clients.map(clientRow).join('') :
    '<li class="empty">Chưa có ứng dụng MCP nào được cấp quyền OAuth.</li>';

  const nav = [['overview','grid','Tổng quan'],['devices','monitor','Thiết bị'],['connection','link','Kết nối MCP'],['activity','activity','Hoạt động'],['clients','users','Quyền truy cập'],['security','shield','Bảo mật']]
    .map(([id,icon,label],i)=>'<a href="#' + id + '"' + (i === 0 ? ' class="active"' : '') + '>' + ico(icon) + esc(label) + '</a>').join('');
  const sidebar = '<aside class="sidebar">' + brand() +
    '<nav aria-label="Điều hướng chính"><p class="nav-group-label">WORKSPACE</p><div class="nav">' + nav + '</div></nav>' +
    '<div class="sidebar-bottom"><div class="relay-note"><span class="pill secure">SELF-HOSTED</span><b>Dữ liệu thuộc quyền bạn</b><p>Thiết bị kết nối trực tiếp về relay của riêng bạn. Không giới hạn lượt gọi hàng tháng.</p></div><div class="side-foot">KARIS CONTROL · PRIVATE EDITION</div></div></aside>';
  const top = '<header class="topbar"><div class="topbar-title">Workspace <span class="topbar-path">/</span> <strong>Control Center</strong></div>' +
    '<div class="topbar-right"><span class="pill online">Relay hoạt động</span><span class="user-avatar" aria-label="Quản trị viên">AD</span>' +
    '<form method="post" action="/dashboard/logout"><button type="submit" class="ghost logout">Đăng xuất</button></form></div></header>';
  const banner = '<section id="overview" class="hero"><div class="hero-kicker">MCP · DEVICE MANAGEMENT</div>' +
    '<h2>Mọi thiết bị.<br>Được kiểm soát tại đây.</h2><p>Quản lý kết nối, phân quyền và hoạt động của Desktop Commander trong một bảng điều khiển riêng tư.</p>' +
    '<div class="hero-bottom"><a href="#devices" class="hero-link">Quản lý thiết bị ' + ico('arrow') + '</a>' +
    '<span class="hero-detail">' + fmt(online) + ' thiết bị đang trực tuyến · Truy cập an toàn</span></div></section>';
  const main = '<main class="workspace"><div class="page-head"><div><span class="eyebrow">TRUNG TÂM ĐIỀU KHIỂN</span><h1>Tổng quan hệ thống</h1>' +
    '<p class="muted">Tình trạng kết nối và các công cụ quản trị trong một nơi.</p></div>' +
    '<div class="heading-date">' + ico('shield') + ' Thiết lập riêng tư</div></div>' +
    (message ? '<div class="notice" role="status">' + esc(message) + '</div>' : '') +
    banner + '<div class="metrics">' + metrics + '</div>' + issued +
    '<div class="main-grid"><div class="primary-col">' +
    '<section id="devices" class="panel"><div class="panel-title"><div><h2>Thiết bị của bạn</h2><p class="muted">Xem trạng thái, đổi máy mặc định và quản lý khóa ghép nối.</p></div><span class="panel-count">' + fmt(list.length) + ' thiết bị</span></div>' +
    '<div class="device-list">' + deviceItems + '</div></section>' +
    '<section id="activity" class="panel" aria-label="Usage and recent activity"><div class="panel-title"><div><h2>Hoạt động gần đây</h2>' +
    '<p class="muted">Chỉ lưu thông tin tác vụ; không ghi nội dung lệnh hoặc nội dung tệp.</p></div><span class="panel-count">' + fmt(usageTotal) + ' lượt</span></div>' +
    '<ul class="list-reset activity-list">' + activityItems + '</ul></section>' +
    '<section id="clients" class="panel"><div class="panel-title"><div><h2>Ứng dụng đã cấp quyền</h2><p class="muted">Thu hồi client để vô hiệu hóa quyền truy cập OAuth của ứng dụng đó.</p></div></div>' +
    '<ul class="list-reset">' + clientItems + '</ul></section></div>' +
    '<div class="side-col">' +
    '<section class="panel side-panel"><div class="icon-box">' + ico('plus') + '</div><h2>Thêm thiết bị</h2><p class="muted">Ghép nối Windows, macOS, Linux hoặc VPS bằng liên kết riêng tư.</p>' +
    '<form method="post" action="/dashboard/devices/new" class="form-stack"><label for="device-name">Tên thiết bị<input id="device-name" name="displayName" maxlength="40" placeholder="Ví dụ: PC làm việc" required></label>' +
    '<label for="device-alias">Alias công cụ<input id="device-alias" name="alias" maxlength="24" placeholder="pc_lam_viec" pattern="[A-Za-z0-9_-]*" title="Chữ, số, gạch ngang hoặc gạch dưới"></label>' +
    '<button type="submit">Tạo liên kết ghép nối ' + ico('arrow') + '</button></form></section>' +
    '<section id="connection" class="panel side-panel endpoint-panel"><div class="icon-box">' + ico('link') + '</div><h2>Kết nối AI client</h2>' +
    '<p class="muted">Thêm địa chỉ này vào ChatGPT, Cursor hoặc VS Code dưới dạng remote MCP có OAuth.</p>' +
    '<label class="field-label" for="mcp-endpoint">MCP Endpoint</label><input class="copy-field" id="mcp-endpoint" readonly value="' + esc(endpoint) + '" aria-label="Địa chỉ MCP endpoint">' +
    '<p class="help">Chọn địa chỉ trong ô và nhấn Ctrl+C để sao chép. OAuth được yêu cầu khi cấp quyền.</p></section>' +
    '<section id="security" class="panel side-panel"><div class="icon-box">' + ico('shield') + '</div><h2>Bảo mật &amp; quyền truy cập</h2>' +
    '<p class="muted">Liên kết ghép nối là thông tin bí mật. Chỉ cấp quyền cho ứng dụng và máy tính bạn tin tưởng.</p>' +
    '<details class="safety-zone"><summary>Quản lý thao tác nguy hiểm…</summary><div><p>Thu hồi tất cả thiết bị sẽ ngắt cả agent VPS đang phục vụ hệ thống này.</p>' +
    '<form method="post" action="/dashboard/devices/revoke-all"><label class="confirm-label"><input type="checkbox" name="confirm" value="yes" required> Tôi hiểu tất cả thiết bị sẽ bị ngắt</label>' +
    '<button type="submit" class="danger">Thu hồi toàn bộ thiết bị</button></form></div></details></section></div></div>' +
    '<footer class="footer">Karis Control · Hệ thống MCP tự lưu trữ · Quyền thực thi phụ thuộc tài khoản OS trên từng thiết bị.</footer></main>';
  const html = page('Dashboard · Karis Control', 'dashboard-body', '<div class="app-shell">' + sidebar + '<div class="main-wrap">' + top + main + '</div></div>');
  const field = '<input type="hidden" name="_csrf" value="' + esc(csrfToken || '') + '">';
  return html.replace(/<form\b[^>]*>/g, x => x + field);
}
