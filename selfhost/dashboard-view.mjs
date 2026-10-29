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
    x:'<path d="M18 6 6 18M6 6l12 12"/>',
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
const brand = () => '<div class="brand"><span class="brand-mark">' + ico('grid') + '</span><span><span class="brand-name">KARIS CONTROL</span></span></div>';
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


export function renderConsoleView({ list, clients, activities, usageTotal, maxDevices, endpoint, agentPackageUrl, pendingLinks = [], pendingLink = null, message, csrfToken, activityPage = 1, view = 'overview' }) {
  const online = list.filter(d => d.online).length;
  const valid = ['overview','activity','clients','security','devices','connection'];
  const current = valid.includes(view) ? view : 'overview';
  const nav = [['overview','grid','Tổng quan'],['activity','activity','Hoạt động'],['clients','users','Truy cập'],['security','shield','Bảo mật']];
  const csrf = '<input type="hidden" name="_csrf" value="' + esc(csrfToken || '') + '">';
  const recentlyIssued = new Set(pendingLinks.map(p => p.deviceId));
  const postForm = (url, content, className = '') => '<form method="post" action="' + url + '" class="' + className + '">' + csrf + content + '</form>';
  const button = (name, icon, dialog, cls='button') => '<button type="button" class="' + cls + '" data-open-dialog="' + dialog + '">' + ico(icon) + name + '</button>';
  const status = d => '<span class="status-badge ' + (d.online ? 'connected' : 'disconnected') + '"><span class="status-dot ' + (d.online ? 'is-online' : '') + '"></span>' + (d.online ? 'Trực tuyến' : 'Ngoại tuyến') + '</span>';
  const platform = d => /win/i.test(d.platform) ? 'monitor' : /mac|darwin/i.test(d.platform) ? 'laptop' : /linux/i.test(d.platform) ? 'server' : 'globe';
  const platformLabel = d => /win/i.test(d.platform) ? 'Windows' : /mac|darwin/i.test(d.platform) ? 'macOS' : /linux/i.test(d.platform) ? 'Linux / VPS' : 'Thiết bị';
  const deviceActionTemplate = d => {
    const path = '/dashboard/devices/' + encodeURIComponent(d.id);
    return '<template data-device-action-template="' + esc(d.id) + '">' +
      '<div class="action-target"><div><strong>' + esc(d.displayName || d.alias) + '</strong><span>' + esc(platformLabel(d)) + '</span></div>' +
      (d.isDefault ? '<span class="default-label">' + ico('shield') + ' Mặc định</span>' : '') + '</div>' +
      '<div class="device-action-block"><h3>Thiết bị mặc định</h3>' +
      (d.isDefault ? '<p>Đang được sử dụng khi không chỉ định máy đích.</p>' :
        postForm(path + '/default','<button type="submit" class="button subtle">Đặt làm mặc định</button>')) + '</div>' +
      '<div class="device-action-block"><h3>Ghép nối lại</h3><p>Cấp lại khóa sẽ ngắt kết nối hiện tại. Chỉ thực hiện khi cần ghép nối lại máy.</p>' +
      postForm(path + '/rotate','<label class="confirm-label"><input type="checkbox" name="confirm" value="rotate" required> Tôi hiểu kết nối hiện tại sẽ bị ngắt</label><button type="submit" class="button danger">Cấp lại khóa</button>', 'device-action-rotate') +
      '</div><details class="device-action-revoke"><summary>Thu hồi quyền thiết bị</summary><p>Thiết bị sẽ không thể kết nối lại bằng khóa hiện tại.</p>' +
      postForm(path + '/revoke','<label class="confirm-label"><input type="checkbox" required> Xác nhận thu hồi thiết bị</label><button type="submit" class="button danger">Thu hồi quyền</button>') + '</details>' +
      '<div class="dialog-footer"><button type="button" class="button subtle" data-close-dialog>Đóng</button></div></template>';
  };
  const deviceTile = (d, full = false) => {
    const id = encodeURIComponent(d.id);
    const actions = full ?
      '<div class="device-tools">' +
        '<button type="button" class="button subtle" data-connect-device data-device-name="' + esc(d.displayName || d.alias) + '" data-device-alias="' + esc(d.alias) + '">Xem kết nối</button>' +
        (recentlyIssued.has(d.id) ? '<a class="button pair-view" href="/dashboard?view=overview&amp;pair=' + id + '">Xem lệnh vừa tạo</a>' : '') +
        '<button type="button" class="button subtle device-options-trigger" data-device-actions data-id="' + esc(d.id) + '" data-name="' + esc(d.displayName || d.alias) + '" data-alias="' + esc(d.alias) + '" data-platform="' + esc(platformLabel(d)) + '" data-default="' + (d.isDefault ? 'true' : 'false') + '" data-protected="' + (d.protected ? 'true' : 'false') + '">Tùy chọn ' + ico('chevron') + '</button></div>' :
      '<button type="button" class="button subtle manage-button" data-open-dialog="devices-dialog" data-device-focus="' + esc(d.id) + '">Quản lý ' + ico('arrow') + '</button>';
    return '<article class="device-tile" data-device-id="' + esc(d.id) + '"><span class="device-icon">' + ico(platform(d)) + '</span><div class="device-info"><strong>' + esc(d.displayName || d.alias) + '</strong><span class="device-sub">' + esc(platformLabel(d)) + (d.isDefault ? ' · Mặc định' : '') + '</span></div><div class="device-connect">' + status(d) + '</div>' + actions + (full ? deviceActionTemplate(d) : '') + '</article>';
  };
  const devicePreview = list.slice(0,4).map(d => deviceTile(d)).join('') || '<div class="empty">Chưa có thiết bị. Thêm thiết bị để bắt đầu.</div>';
  const allDevices = list.map(d => deviceTile(d,true)).join('') || '<div class="empty">Chưa có thiết bị nào.</div>';
  const activitiesRows = rows => (rows.length ? rows.map(a => {
    const ok = a.status === 'ok' || a.status === 'success';
    const ms = Number.isFinite(Number(a.durationMs)) ? fmt(a.durationMs) + ' ms' : '—';
    return '<li class="activity-row"><span class="activity-symbol">' + ico(ok?'activity':'shield') + '</span><span class="activity-copy"><strong>' + esc(a.tool || 'Tác vụ') + '</strong><small>' + esc(a.device || 'relay') + ' · ' + (ok?'Thành công':esc(a.status || 'Lỗi')) + '</small></span><time>' + esc(ms) + '</time></li>';
  }).join('') : '<li class="empty">Chưa có hoạt động gần đây.</li>');
  const clientsRows = clients.length ? clients.map(c => {
    const id=String(c.client_id || '');
    return '<li class="client-row"><span class="client-icon">' + ico('link') + '</span><div><strong>' + esc(c.client_name || 'Ứng dụng MCP') + '</strong><small>ID ' + esc(id.slice(0, 12)) + '…</small></div><details><summary class="button subtle">Thu hồi</summary>' +
    postForm('/dashboard/clients/'+encodeURIComponent(id)+'/revoke','<label class="confirm-label"><input type="checkbox" required> Xác nhận thu hồi OAuth</label><button type="submit" class="button danger">Thu hồi quyền</button>') + '</details></li>';
  }).join('') : '<li class="empty">Chưa cấp quyền cho ứng dụng nào.</li>';
  const modal = (id,title,body,wide=false,extra='') => '<dialog id="' + id + '" class="control-dialog' + (wide ? ' wide' : '') + '"' + extra + ' aria-labelledby="' + id + '-title"><div class="dialog-head"><h2 id="' + id + '-title" tabindex="-1">' + title + '</h2><button type="button" class="icon-button" data-close-dialog aria-label="Đóng cửa sổ">' + ico('x') + '</button></div><div class="dialog-body">' + body + '</div></dialog>';
  const addForm = '<p class="dialog-lead">Thêm tên để phân biệt máy. Liên kết kết nối sẽ xuất hiện sau khi tạo.</p>' +
    postForm('/dashboard/devices/new',
      '<label for="device-name">Tên thiết bị<input id="device-name" name="displayName" maxlength="40" placeholder="PC làm việc" required></label>' +
      '<label for="device-alias">Tên ngắn (không bắt buộc)<input id="device-alias" name="alias" maxlength="24" placeholder="pc_lam_viec" pattern="[A-Za-z0-9_-]*"></label>' +
      '<div class="dialog-footer"><button type="button" class="button subtle" data-close-dialog>Hủy</button><button type="submit" class="button primary">' + ico('plus') + ' Thêm thiết bị</button></div>', 'pair-form');
  const issued = pendingLink ? modal('pair-result-dialog','Ghép nối · ' + esc(pendingLink.displayName),
    '<p class="dialog-lead">Sao chép lệnh dưới đây và chạy trên máy cần kết nối. Liên kết này chỉ mở lại được trong phiên quản trị hiện tại, tối đa 10 phút sau khi tạo.</p>' +
    '<label class="copy-label" for="pair-link">Liên kết ghép nối riêng</label><div class="secret-copy"><textarea id="pair-link" class="copy-field" rows="2" readonly>' + esc(pendingLink.url) + '</textarea><button type="button" class="button subtle" data-copy-target="pair-link">Sao chép</button></div>' +
    '<label class="copy-label" for="pair-command">Lệnh chạy trên thiết bị</label><div class="secret-copy"><textarea id="pair-command" class="copy-field" rows="3" readonly>' + esc(pendingLink.command) + '</textarea><button type="button" class="button subtle" data-copy-target="pair-command">Sao chép</button></div>' +
    '<p class="pair-warning">Không chia sẻ liên kết này. Sau 10 phút, dashboard không còn hiển thị lại khóa cũ; thiết bị đã ghép nối vẫn hoạt động bình thường.</p>' +
    '<div class="dialog-footer"><button type="button" class="button primary" data-close-dialog>Đã hiểu</button></div>',true,' data-auto-open') : '';
  const deviceConnection = modal('device-connection-dialog','Thông tin kết nối',
    '<div class="connection-target"><strong id="connection-device-name"></strong><span id="connection-device-alias"></span></div>' +
    '<label class="copy-label" for="connection-mcp-endpoint">MCP endpoint (kết nối ChatGPT và các ứng dụng)</label><div class="secret-copy"><input id="connection-mcp-endpoint" class="copy-field" readonly value="' + esc(endpoint) + '"><button class="button subtle" type="button" data-copy-target="connection-mcp-endpoint">Sao chép</button></div>' +
    '<label class="copy-label" for="connection-command">Mẫu lệnh ghép nối thiết bị</label><textarea id="connection-command" class="copy-field" rows="3" data-agent-package="' + esc(agentPackageUrl) + '" readonly></textarea>' +
    '<p class="pair-warning">Lệnh mẫu cần thay &lt;LINK_GHEP_NOI&gt; bằng liên kết riêng. Khóa của thiết bị đã được lưu dưới dạng băm nên không thể xem lại. Chỉ cấp lại khóa khi thật sự cần kết nối lại, vì thao tác đó ngắt kết nối hiện tại.</p>' +
    '<div class="dialog-footer"><button type="button" class="button primary" data-close-dialog>Đóng</button></div>');
  const deviceActions = modal('device-actions-dialog','Tùy chọn thiết bị', '<div id="device-actions-content"></div>');
  const sidebar = '<aside class="sidebar">' + brand() + '<nav aria-label="Điều hướng chính"><div class="nav">' +
    nav.map(([id,ic,label]) => '<a href="/dashboard?view=' + id + '" data-page-nav="' + id + '"' + ((id===current || (['devices','connection'].includes(current)&&id==='overview'))?' class="active" aria-current="page"':'') + '>' + ico(ic) + '<span>' + label + '</span></a>').join('') +
    '</div></nav></aside>';
  const top = '<header class="topbar"><strong class="topbar-heading">Karis Control</strong><div class="topbar-right"><span id="live-health" class="health-state" role="status" aria-live="polite"><span class="status-dot"></span><span>Đang kết nối</span></span>' +
    postForm('/dashboard/logout','<button class="button subtle signout" type="submit">' + ico('logout') + '<span>Đăng xuất</span></button>') + '</div></header>';
  const metrics = '<div class="metrics" data-live-region="metrics">' +
    [['Trực tuyến',online,'monitor'],['Thiết bị',list.length,'server'],['Lượt gọi',usageTotal,'activity']].map(([name,n,ic]) =>
      '<div class="metric"><span>' + ico(ic) + esc(name) + '</span><strong>' + fmt(n) + '</strong></div>').join('') + '</div>';
  const overview = '<section class="console-view" data-view="overview"><div class="page-head"><div><h1>Tổng quan</h1></div>' + button('Thêm thiết bị','plus','add-device-dialog','button primary add-trigger') + '</div>' +
    metrics + '<div class="overview-grid"><section class="panel devices-panel"><div class="panel-head"><h2>Thiết bị <span class="section-count" data-device-total>' + fmt(list.length) + '</span></h2><div class="panel-actions">' +
    button('Xem tất cả','arrow','devices-dialog','button text-action') + '</div></div><div class="device-list" data-live-region="preview-devices">' + devicePreview + '</div></section>' +
    '<section class="panel mcp-panel"><div class="panel-head"><h2>' + ico('link') + ' Kết nối MCP</h2></div>' +
    '<label for="mcp-endpoint">Địa chỉ MCP</label><div class="endpoint-control"><input id="mcp-endpoint" class="copy-field" value="' + esc(endpoint) + '" readonly aria-label="Địa chỉ máy chủ MCP"><button type="button" class="button subtle" data-copy-target="mcp-endpoint">' + ico('link') + ' Sao chép</button></div>' +
    '<div class="mcp-live" data-live-region="mcp-status"><span class="status-dot' + (online ? ' is-online' : '') + '"></span><strong>' + (online ? fmt(online) + ' thiết bị sẵn sàng' : 'Chưa có thiết bị trực tuyến') + '</strong><a href="/dashboard?view=clients">' + fmt(clients.length) + ' ứng dụng được cấp quyền</a></div></section></div>' +
    '<section class="panel recent-panel"><div class="panel-head"><h2>Hoạt động gần đây</h2><a class="button text-action" href="/dashboard?view=activity">Xem chi tiết ' + ico('arrow') + '</a></div>' +
    '<ul class="activity-list" data-live-region="recent-activities">' + activitiesRows(activities.slice(0,4)) + '</ul></section></section>';
  const viewPage = (key,title,body) => '<section class="console-view" data-view="' + key + '"><div class="page-head"><h1>' + title + '</h1></div>' + body + '</section>';
  const pageSize = 20, totalPages = Math.max(1, Math.ceil(activities.length / pageSize));
  const requestedPage = Number(activityPage);
  const currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, totalPages) : 1;
  const start = (currentPage - 1) * pageSize;
  const pageUrl = p => '/dashboard?view=activity&amp;page=' + p;
  const around = [...new Set([1,currentPage-1,currentPage,currentPage+1,totalPages].filter(p => p >= 1 && p <= totalPages))].sort((a,b) => a-b);
  const pagination = '<nav class="activity-pagination" aria-label="Phân trang hoạt động" data-live-region="activity-pagination">' +
    '<span class="pagination-summary">' + (activities.length ? fmt(start+1) + '–' + fmt(Math.min(start+pageSize,activities.length)) + ' / ' + fmt(activities.length) + ' hoạt động' : 'Chưa có hoạt động') + '</span>' +
    '<div class="pagination-actions">' +
    (currentPage > 1 ? '<a class="button subtle" href="' + pageUrl(currentPage-1) + '" rel="prev">Trước</a>' : '<span class="button subtle disabled" aria-disabled="true">Trước</span>') +
    around.map((p,i) => (i && p > around[i-1]+1 ? '<span class="page-gap">…</span>' : '') +
      '<a class="page-index' + (p===currentPage ? ' active' : '') + '" href="' + pageUrl(p) + '"' + (p===currentPage ? ' aria-current="page"' : '') + ' aria-label="Trang ' + p + '">' + p + '</a>').join('') +
    (currentPage < totalPages ? '<a class="button subtle" href="' + pageUrl(currentPage+1) + '" rel="next">Sau</a>' : '<span class="button subtle disabled" aria-disabled="true">Sau</span>') +
    '</div></nav>';
  const activityPageView = viewPage('activity','Hoạt động','<div class="panel"><div class="panel-head"><h2>Lịch sử hoạt động</h2></div><ul class="activity-list" data-live-region="activity-list">' + activitiesRows(activities.slice(start,start+pageSize)) + '</ul>' + pagination + '</div>');
  const clientsPage = viewPage('clients','Quyền truy cập','<div class="panel"><div class="panel-head"><h2>Ứng dụng được cấp quyền</h2></div><ul class="client-list" data-live-region="client-list">' + clientsRows + '</ul></div>');
  const securityPage = viewPage('security','Bảo mật','<div class="panel security-panel"><h2>Bảo vệ kết nối</h2><p>Chỉ chia sẻ khóa ghép nối với thiết bị bạn tin tưởng. Thu hồi quyền có thể ngắt thiết bị đang chạy.</p><details class="danger-option"><summary class="button subtle">Thao tác nguy hiểm ' + ico('chevron') + '</summary>' +
    postForm('/dashboard/devices/revoke-all','<label class="confirm-label"><input type="checkbox" name="confirm" value="yes" required> Tôi hiểu mọi thiết bị sẽ bị ngắt</label><button type="submit" class="button danger">Thu hồi toàn bộ thiết bị</button>') + '</details></div>');
  // Keep old deep links functional; navigation now prioritizes user-requested overview dialogs.
  const devicePage = viewPage('devices','Thiết bị', '<div class="panel"><div class="panel-head"><h2>Quản lý thiết bị</h2>' + button('Thêm thiết bị','plus','add-device-dialog','button primary') + '</div><div class="device-list" data-live-region="device-full-list">' + allDevices + '</div></div>');
  const connectionPage = viewPage('connection','Kết nối MCP','<div class="panel mcp-panel"><h2>Địa chỉ MCP</h2><input class="copy-field" id="mcp-secondary" readonly value="' + esc(endpoint) + '"><button type="button" class="button subtle" data-copy-target="mcp-secondary">Sao chép</button></div>');
  const views = {overview,activity:activityPageView,clients:clientsPage,security:securityPage,devices:devicePage,connection:connectionPage};
  const dialogs = modal('add-device-dialog','Thêm thiết bị',addForm) +
    modal('devices-dialog','Quản lý thiết bị',
      '<div class="device-filter-bar"><label for="device-filter">Tìm thiết bị<input type="search" id="device-filter" placeholder="Tên thiết bị, alias, hệ điều hành" autocomplete="off"></label><span id="device-filter-count" role="status" aria-live="polite">' + fmt(list.length) + ' thiết bị</span></div>' +
      '<div class="dialog-list" data-live-region="modal-device-list">' + allDevices + '</div>' +
      '<p id="device-filter-empty" class="empty" hidden>Không tìm thấy thiết bị phù hợp.</p>',true) + deviceConnection + deviceActions + issued;
  const content = '<div class="app-shell">' + sidebar + '<div class="main-wrap">' + top + '<main class="workspace">' +
    (message?'<div class="notice" role="status">'+esc(message)+'</div>':'') + views[current] +
    '</main></div></div>' + dialogs + '<span id="copy-status" class="sr-only" role="status" aria-live="polite"></span>' +
    '<script src="/dashboard/ui.js" defer></script>';
  return page('Karis Control · ' + current, 'dashboard-body', content);
}
