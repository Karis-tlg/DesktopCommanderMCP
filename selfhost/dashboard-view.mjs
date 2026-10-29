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

export function renderConsoleView({ list, clients, activities, usageTotal, maxDevices, endpoint, pendingLink, message, csrfToken, view = "overview" }) {
  const online = list.filter(x => x.online).length;
  const navItems = [
    ['overview','grid','Tổng quan'],
    ['devices','monitor','Thiết bị'],
    ['connection','link','Kết nối MCP'],
    ['activity','activity','Hoạt động'],
    ['clients','users','Quyền truy cập'],
    ['security','shield','Bảo mật']
  ];
  const current = pendingLink ? 'devices' : (navItems.some(x => x[0] === view) ? view : 'overview');
  const metrics = [
    ['Thiết bị online', online, 'devices', 'monitor'],
    ['Đã ghép nối', list.length, 'devices', 'server'],
    ['Lượt gọi công cụ', usageTotal, 'activity', 'activity'],
    ['Ứng dụng OAuth', clients.length, 'clients', 'users']
  ].map(([label,value,link,icon]) => '<a class="metric" href="/dashboard?view=' + link + '"><span class="metric-top"><span class="metric-label">' + esc(label) + '</span>' + ico(icon) + '</span><strong class="metric-num">' + fmt(value) + '</strong><span class="metric-foot">Xem chi tiết ' + ico('arrow') + '</span></a>').join('');
  const deviceItems = list.length ? list.map(deviceRow).join('') : '<p class="empty">Chưa có thiết bị. Chọn Thêm thiết bị để bắt đầu.</p>';
  const activityItems = activities.length ? activities.slice(0, 12).map(activityRow).join('') : '<li class="empty">Chưa có hoạt động nào.</li>';
  const clientItems = clients.length ? clients.map(clientRow).join('') : '<li class="empty">Chưa có ứng dụng nào được cấp quyền.</li>';
  const previews = list.slice(0, 3).map(d => '<div class="overview-device"><span class="status-dot ' + (d.online ? 'is-online' : '') + '"></span><span class="overview-device-name">' + esc(d.displayName || d.alias) + '</span><span class="overview-device-state">' + (d.online ? 'Trực tuyến' : 'Ngoại tuyến') + '</span></div>').join('') || '<p class="empty">Chưa ghép nối thiết bị.</p>';
  const recent = activities.slice(0, 5).map(activityRow).join('') || '<li class="empty">Chưa có hoạt động.</li>';
  const issued = pendingLink ? '<section class="panel issued" role="status" aria-label="Thông tin ghép nối"><h2>Liên kết ghép nối đã tạo</h2><p><strong>' + esc(pendingLink.displayName) + '</strong> · Liên kết chỉ hiển thị một lần, hãy giữ riêng tư.</p><label>Liên kết ghép nối</label><div class="secret">' + esc(pendingLink.url) + '</div><label>Lệnh cài đặt trên máy tính</label><div class="secret">' + esc(pendingLink.command) + '</div><p>Sao chép và chạy trên thiết bị cần kết nối.</p></section>' : '';
  const pageView = (id, title, description, body) => current !== id ? '' : '<section class="console-view" id="view-' + id + '" data-view="' + id + '"><div class="page-head"><div><p class="page-kicker">KARIS CONTROL / ' + esc(navItems.find(x=>x[0]===id)?.[2] || title) + '</p><h1>' + esc(title) + '</h1><p class="muted">' + esc(description) + '</p></div></div>' + body + '</section>';
  const panelHeading = (title, description, link, label) => '<div class="panel-title"><div><h2>' + title + '</h2><p class="muted">' + description + '</p></div>' + (link ? '<a class="text-link" href="/dashboard?view=' + link + '">' + label + ' ' + ico('arrow') + '</a>' : '') + '</div>';
  const sidebar = '<aside class="sidebar">' + brand() + '<nav aria-label="Điều hướng chính"><p class="nav-group-label">QUẢN TRỊ</p><div class="nav">' + navItems.map(([id,icon,label]) => '<a href="/dashboard?view=' + id + '" data-page-nav="' + id + '"' + (id === current ? ' class="active" aria-current="page"' : '') + '>' + ico(icon) + esc(label) + '</a>').join('') + '</div></nav><div class="sidebar-bottom"><div class="sidebar-status"><span class="status-dot is-online"></span><span>Self-hosted relay</span></div><span class="sidebar-caption">Kết nối bảo mật</span></div></aside>';
  const top = '<header class="topbar"><div class="topbar-title"><span class="topbar-icon">' + ico('grid') + '</span><strong>Control Center</strong><span class="topbar-separator">/</span><span>Workspace</span></div><div class="topbar-right"><span class="relay-indicator"><span class="status-dot is-online"></span> Relay hoạt động</span><form method="post" action="/dashboard/logout"><button type="submit" class="ghost logout">' + ico('logout') + ' Đăng xuất</button></form></div></header>';
  const overview = pageView('overview','Tổng quan','Trạng thái hệ thống và lối tắt đến các tác vụ quan trọng.',
    '<div class="overview-intro"><div><span class="overview-eyebrow">HỆ THỐNG ĐANG HOẠT ĐỘNG</span><h2>Quản lý thiết bị trong một nơi.</h2><p>' + fmt(online) + ' / ' + fmt(list.length) + ' thiết bị đang kết nối với relay.</p></div><a class="primary-link" href="/dashboard?view=devices">' + ico('plus') + ' Quản lý thiết bị</a></div>' +
    '<div class="metrics">' + metrics + '</div><div class="overview-grid"><section class="panel">' + panelHeading('Thiết bị','Tình trạng ghép nối gần đây.','devices','Xem tất cả') + '<div class="overview-devices">' + previews + '</div></section>' +
    '<section class="panel">' + panelHeading('Hoạt động gần đây','Không lưu nội dung lệnh hay tập tin.','activity','Xem lịch sử') + '<ul class="list-reset activity-list">' + recent + '</ul></section></div>' +
    '<div class="quick-links"><a href="/dashboard?view=connection">' + ico('link') + '<span><strong>Kết nối AI client</strong><small>Endpoint MCP và OAuth</small></span>' + ico('arrow') + '</a><a href="/dashboard?view=clients">' + ico('users') + '<span><strong>Ứng dụng đã cấp quyền</strong><small>Xem và thu hồi OAuth</small></span>' + ico('arrow') + '</a></div>');
  const devicesPage = pageView('devices','Thiết bị','Xem thiết bị kết nối, đổi máy mặc định và tạo liên kết ghép nối.',
    issued + '<section class="panel compact-panel">' + panelHeading('Thêm thiết bị','Ghép nối máy Windows, macOS, Linux hoặc VPS.') +
    '<form method="post" action="/dashboard/devices/new" class="form-stack pair-form"><label for="device-name">Tên thiết bị<input id="device-name" name="displayName" maxlength="40" placeholder="Ví dụ: PC làm việc" required></label>' +
    '<label for="device-alias">Alias công cụ<input id="device-alias" name="alias" maxlength="24" placeholder="pc_lam_viec" pattern="[A-Za-z0-9_-]*" title="Chữ, số, gạch ngang hoặc gạch dưới"></label>' +
    '<button type="submit">' + ico('plus') + ' Tạo liên kết</button></form></section>' +
    '<section class="panel">' + panelHeading('Danh sách thiết bị',fmt(list.length) + ' / ' + fmt(maxDevices) + ' thiết bị đã ghép nối.') + '<div class="device-list">' + deviceItems + '</div></section>');
  const connectionPage = pageView('connection','Kết nối MCP','Dùng địa chỉ riêng tư này để thêm remote MCP vào ứng dụng AI.',
    '<section class="panel connection-card"><div class="section-icon">' + ico('link') + '</div><h2>Remote MCP endpoint</h2><p class="muted">Sử dụng với ChatGPT, Cursor hoặc VS Code. Ứng dụng sẽ yêu cầu OAuth khi kết nối.</p>' +
    '<label class="field-label" for="mcp-endpoint">Địa chỉ máy chủ</label><div class="endpoint-control"><input class="copy-field" id="mcp-endpoint" readonly value="' + esc(endpoint) + '" aria-label="Địa chỉ MCP endpoint"></div><p class="help">Chọn địa chỉ và nhấn Ctrl+C để sao chép. Ứng dụng AI vẫn yêu cầu xác thực OAuth.</p></section>' +
    '<section class="panel steps-panel"><h2>Các bước kết nối</h2><ol><li>Mở cài đặt MCP hoặc Connectors trong ứng dụng AI.</li><li>Thêm remote MCP và dán endpoint phía trên.</li><li>Hoàn tất OAuth; sau đó kiểm tra thiết bị trong mục Thiết bị.</li></ol></section>');
  const activityPage = pageView('activity','Hoạt động','Theo dõi các lượt gọi công cụ và trạng thái xử lý.',
    '<section class="panel">' + panelHeading('Nhật ký gần đây','Chỉ lưu tên tác vụ, thiết bị, trạng thái và thời lượng.') + '<div class="list-total">' + fmt(usageTotal) + ' lượt gọi tổng cộng</div><ul class="list-reset activity-list">' + activityItems + '</ul></section>');
  const clientsPage = pageView('clients','Quyền truy cập','Xem các ứng dụng đã được cấp quyền truy cập OAuth.',
    '<section class="panel">' + panelHeading('Ứng dụng đã cấp quyền','Chỉ thu hồi ứng dụng bạn không còn sử dụng.') + '<ul class="list-reset client-list">' + clientItems + '</ul></section>');
  const securityPage = pageView('security','Bảo mật','Quản lý thao tác nhạy cảm và quyền của các thiết bị đã ghép nối.',
    '<section class="panel security-advice"><div class="section-icon">' + ico('shield') + '</div><h2>Quyền truy cập của bạn</h2><p>Liên kết ghép nối là bí mật. Không gửi cho người khác và chỉ cấp quyền cho thiết bị đáng tin cậy.</p><p class="muted">Để thu hồi một thiết bị cụ thể, vào mục Thiết bị → Quản lý.</p></section>' +
    '<section class="panel critical-panel"><h2>Thao tác nguy hiểm</h2><p class="muted">Thu hồi toàn bộ thiết bị cũng sẽ ngắt agent VPS đang phục vụ relay này.</p><details class="safety-zone"><summary>Hiện tùy chọn thu hồi toàn bộ thiết bị ' + ico('chevron') + '</summary><div><form method="post" action="/dashboard/devices/revoke-all"><label class="confirm-label"><input type="checkbox" name="confirm" value="yes" required> Tôi hiểu tất cả thiết bị sẽ bị ngắt</label><button type="submit" class="danger">Thu hồi toàn bộ thiết bị</button></form></div></details></section>');
  const all = '<main class="workspace">' + (message ? '<div class="notice" role="status">' + esc(message) + '</div>' : '') + overview + devicesPage + connectionPage + activityPage + clientsPage + securityPage + '<footer class="footer">Karis Control · Self-hosted MCP</footer></main>';
  const html = page('Dashboard · Karis Control', 'dashboard-body', '<div class="app-shell">' + sidebar + '<div class="main-wrap">' + top + all + '</div></div>');
  const field = '<input type="hidden" name="_csrf" value="' + esc(csrfToken || '') + '">';
  return html.replace(/<form\b[^>]*>/g, x => x + field);
}
