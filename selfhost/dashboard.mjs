import { randomUUID } from 'node:crypto';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug = value => String(value || 'device').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'device';
const now = () => Math.floor(Date.now() / 1000);

export function registerDashboard({ app, db, save, adminKey, issuer, devices, onChange, random, digest, equal, maxDevices, failures, agentPackageUrl }) {
  const sessions = new Map();
  const secure = issuer.protocol === 'https:' ? '; Secure' : '';
  const cookieName = 'karis_admin';

  function cookies(req) {
    const result = {};
    for (const part of String(req.headers.cookie || '').split(';')) {
      const ix = part.indexOf('=');
      if (ix < 0) continue;
      const k = part.slice(0, ix).trim();
      try { result[k] = decodeURIComponent(part.slice(ix + 1).trim()); } catch {}
    }
    return result;
  }
  function sessionFor(req) {
    const token = cookies(req)[cookieName];
    if (!token) return null;
    const key = digest(token);
    const session = sessions.get(key);
    if (!session || session.expiresAt < Date.now()) { sessions.delete(key); return null; }
    return { key, session };
  }
  function sameOrigin(req) {
    if (!req.headers.origin) return true;
    try { return new URL(req.headers.origin).host === req.get('host'); } catch { return false; }
  }
  function loginPage(message = '') {
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Karis MCP · Sign in</title><style>' +
      'body{font:16px system-ui;max-width:430px;margin:12vh auto;padding:24px;background:#0b1220;color:#edf2f7}form,section{background:#121d30;border:1px solid #29364d;border-radius:14px;padding:24px}input,button{font:inherit;width:100%;box-sizing:border-box;padding:12px;margin:8px 0;border-radius:8px}input{background:#0b1220;border:1px solid #45546d;color:white}button{background:#7dd3fc;color:#082f49;border:0;font-weight:700;cursor:pointer}.muted{color:#a8b4c8;font-size:13px}.error{color:#fca5a5}</style><h1>Karis MCP</h1><p class="muted">Private self-hosted Desktop Commander control panel</p><form method="post" action="/dashboard/login"><h2>Admin sign in</h2><p class="muted">Use the private admin password configured on this VPS.</p>' +
      (message ? '<p class="error">' + esc(message) + '</p>' : '') +
      '<label>Admin password<input type="password" name="password" autocomplete="current-password" required></label><button type="submit">Sign in</button></form><p class="muted">The panel never displays or stores your admin password in the browser.</p></html>';
  }
  function deviceList() {
    return Object.values(db.devices || {}).filter(d => !d.revokedAt).sort((a,b) => {
      if (a.protected !== b.protected) return a.protected ? -1 : 1;
      return String(a.displayName).localeCompare(String(b.displayName));
    });
  }
  function deviceCard(d) {
    const live = devices.get(d.id);
    const online = !!live && live.ws?.readyState === 1;
    const seen = d.lastSeen ? new Date(d.lastSeen * 1000).toLocaleString('en-GB', {timeZone:'UTC'}) + ' UTC' : 'Never connected';
    const status = online ? '<span class="pill online">Online</span>' : '<span class="pill offline">Offline</span>';
    const isDefault = db.defaultDeviceId === d.id;
    const actions = (isDefault ? '<span class="pill default">Default device</span>' : '<form method="post" action="/dashboard/devices/' + encodeURIComponent(d.id) + '/default"><button class="secondary" type="submit">Make default</button></form>') +
      '<form method="post" action="/dashboard/devices/' + encodeURIComponent(d.id) + '/rotate"><button class="secondary" type="submit">Rotate pairing key</button></form>' +
      '<form method="post" action="/dashboard/devices/' + encodeURIComponent(d.id) + '/revoke"><button class="danger" type="submit">Revoke device</button></form>';
    const caution = d.protected ? '<p class="muted warning">This is the VPS agent hosting this panel. Rotating or revoking it disconnects VPS tools until you re-pair it.</p>' : '';
    return '<article class="device"><div class="device-head"><div><h3>' + esc(d.displayName) + '</h3><p class="muted">' + esc(d.alias) + ' · ' + esc(d.platform || 'platform unknown') + '</p></div>' + status + '</div><div class="stats"><div><small>Tools</small><strong>' + (d.tools || []).length + '</strong></div><div><small>Last seen</small><strong class="lastseen">' + esc(seen) + '</strong></div><div><small>Added</small><strong>' + esc(new Date((d.createdAt || now()) * 1000).toLocaleDateString('en-GB')) + '</strong></div></div><div class="actions">' + actions + '</div></article>';
  }
  function render(req, res, message = '') {
    const found = sessionFor(req);
    if (!found) { res.status(401).type('html').send(loginPage()); return; }
    const s = found.session;
    let issued = '';
    if (s.pendingLink && s.pendingLink.expiresAt > Date.now()) {
      const p = s.pendingLink;
      s.pendingLink = null;
      const pairUrl = issuer.origin + '/pair/' + p.token;
      const command = 'npx --yes --package=' + agentPackageUrl + ' desktop-commander remote --endpoint ' + pairUrl + ' --name ' + p.alias;
      issued = '<section class="issued"><h2>Pair this device now</h2><p><b>' + esc(p.displayName) + '</b> · The secret link is shown once. Treat it like a password.</p><label>Private pairing URL</label><pre>' + esc(pairUrl) + '</pre><label>One-command installer</label><pre>' + esc(command) + '</pre><p class="muted">Run the command on the computer you want to control. After it connects, the device appears below. If you lose this link, rotate the key to generate a new one.</p></section>';
    }
    const list = deviceList();
    const cards = list.length ? list.map(deviceCard).join('') : '<section><p>No devices paired yet. Use Add device to create the first pairing link.</p></section>';
    const clientRows = Object.values(db.clients || {}).map(c =>
      '<li><span><b>' + esc(c.client_name || 'Unnamed MCP client') + '</b><small>' + esc(String(c.client_id || '').slice(0, 12)) + '…</small></span><form method="post" action="/dashboard/clients/' + encodeURIComponent(c.client_id) + '/revoke"><button class="danger" type="submit">Revoke</button></form></li>'
    ).join('') || '<li class="muted">No OAuth clients authorized yet.</li>';
    const usageTotal = Number(db.usage?.totalCalls) || 0;
    const activityRows = (db.activity || []).slice(0, 15).map(a =>
      '<li><span><b>' + esc(a.tool) + '</b><small>' + esc(a.device) + ' · ' + esc(a.status) + ' · ' + esc(a.durationMs) + ' ms · ' + esc(a.at) + (a.error ? ' · ' + esc(a.error) : '') + '</small></span></li>'
    ).join('') || '<li class="muted">No tool calls recorded yet.</li>';
    const endpoint = issuer.origin + '/mcp';
    const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Karis MCP · Dashboard</title><style>' +
      'body{font:15px system-ui;max-width:1080px;margin:30px auto;padding:0 20px;background:#0b1220;color:#edf2f7}h1,h2,h3,p{margin-top:0}h1{font-size:28px}h2{font-size:19px}.muted,small{color:#a8b4c8}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.pill{font-size:12px;border-radius:999px;padding:5px 9px;white-space:nowrap}.online{background:#14532d;color:#bbf7d0}.offline{background:#3f3f46;color:#e4e4e7}.default{background:#164e63;color:#bae6fd}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}.device,section{background:#121d30;border:1px solid #29364d;border-radius:14px;padding:20px;margin:14px 0}.device-head{display:flex;justify-content:space-between;gap:12px}.device h3{margin-bottom:4px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0}.stats div{background:#0b1220;padding:10px;border-radius:8px;min-width:0}.stats small,.stats strong{display:block}.stats strong{font-size:13px;overflow-wrap:anywhere;margin-top:5px}.lastseen{font-weight:400}.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.actions form{margin:0}button{font:inherit;padding:9px 12px;border-radius:8px;border:0;background:#7dd3fc;color:#082f49;font-weight:650;cursor:pointer}.secondary{background:#26374e;color:#e2e8f0;border:1px solid #45546d}.danger{background:#7f1d1d;color:#fee2e2}.add-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:end}.add-form label{display:block;color:#a8b4c8;font-size:13px}.add-form input{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;background:#0b1220;border:1px solid #45546d;border-radius:8px;color:white;font:inherit}.add-form button{height:43px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#080d17;border:1px solid #29364d;border-radius:8px;padding:12px;color:#bae6fd;font-size:13px}code{overflow-wrap:anywhere}.issued{border-color:#0e7490}.warning{color:#fde68a}.section-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}ul.clients{list-style:none;padding:0}ul.clients li{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid #29364d;padding:12px 0}ul.clients form{margin:0}.msg{color:#fde68a}footer{color:#64748b;font-size:12px;margin:30px 0}a{color:#7dd3fc}</style>' +
      '<header class="top"><div><h1>Karis MCP Dashboard</h1><p class="muted">Self-hosted Desktop Commander · no hosted monthly tool-call cap</p></div><form method="post" action="/dashboard/logout"><button class="secondary" type="submit">Sign out</button></form></header>' +
      (message ? '<p class="msg">' + esc(message) + '</p>' : '') + issued +
      '<section><div class="section-head"><div><h2>Your devices</h2><p class="muted">' + list.filter(d => devices.has(d.id)).length + ' online · ' + list.length + ' paired · limit ' + maxDevices + '</p></div><form method="post" action="/dashboard/devices/revoke-all"><label class="muted"><input type="checkbox" name="confirm" value="yes" required> I understand this disconnects every device, including the VPS agent.</label><button class="danger" type="submit">Revoke all devices</button></form></div><div class="grid">' + cards + '</div></section>' +
      '<section><h2>Add a device</h2><p class="muted">Create a unique, revocable pairing link for each Windows, macOS, Linux PC or VPS. Each device has its own key and name.</p><form class="add-form" method="post" action="/dashboard/devices/new"><label>Device display name<input name="displayName" maxlength="40" placeholder="Kha Windows PC" required></label><label>Tool alias<input name="alias" maxlength="24" placeholder="kha_pc"></label><button type="submit">Create pairing link</button></form></section>' +
      '<section><h2>Connect an AI client</h2><p class="muted">Register this remote MCP endpoint in ChatGPT, Cursor, VS Code or another MCP-compatible client. OAuth is required for the standard endpoint.</p><pre>' + esc(endpoint) + '</pre><p>ChatGPT: create a custom connector and use the URL above. Cursor / VS Code: add it as a remote MCP server with OAuth. Authorize once; tokens can be revoked here.</p><p class="muted">The separate per-device pairing links above are only for the computer agent, not the AI connector.</p></section>' +
      '<section><h2>Usage and recent activity</h2><p class="muted">Lifetime tool calls: ' + usageTotal + ' · Monthly hosted quota: none. Tool arguments and file contents are not recorded in this activity list.</p><ul class="clients">' + activityRows + '</ul></section>' +
      '<section><h2>Authorized MCP clients</h2><p class="muted">Each client has separate OAuth tokens. Revoking a client removes its access and refresh tokens.</p><ul class="clients">' + clientRows + '</ul></section>' +
      '<footer>Private self-hosted service · Device tools run with the OS permissions of each connected computer. Protect pairing links and only authorize clients you trust.</footer></html>';
    res.status(200).type('html').send(html);
  }
  function requireSession(req, res) {
    const found = sessionFor(req);
    if (!found) { res.status(401).type('html').send(loginPage('Your session expired. Please sign in again.')); return null; }
    if (!sameOrigin(req)) { res.status(403).send('Cross-origin request rejected'); return null; }
    return found;
  }
  function uniqueAlias(base, exceptId = '') {
    const used = new Set(deviceList().filter(d => d.id !== exceptId).map(d => d.alias));
    let value = slug(base), i = 2;
    while (used.has(value)) value = (slug(base).slice(0, 20) + '_' + i++);
    return value;
  }
  function issuePair(found, record, token) {
    found.session.pendingLink = { token, deviceId: record.id, alias: record.alias, displayName: record.displayName, expiresAt: Date.now() + 10 * 60 * 1000 };
  }
  function createPair(record, found) {
    const token = random();
    record.tokenHash = digest(token);
    record.revokedAt = null;
    record.updatedAt = now();
    issuePair(found, record, token);
    save();
    onChange();
  }

  app.get('/', (_req, res) => res.redirect(302, '/dashboard'));
  app.get('/dashboard', (req, res) => render(req, res));
  app.post('/dashboard/login', (req, res) => {
    const ip = req.socket.remoteAddress || 'local';
    const failure = failures.get(ip) || { n: 0, exp: now() + 900 };
    if (failure.exp < now()) { failure.n = 0; failure.exp = now() + 900; }
    if (failure.n >= 8) { res.status(429).type('html').send(loginPage('Too many attempts. Try again later.')); return; }
    if (typeof req.body?.password !== 'string' || !equal(req.body.password, adminKey)) {
      failure.n++; failures.set(ip, failure); res.status(403).type('html').send(loginPage('Incorrect password.')); return;
    }
    failures.delete(ip);
    const token = random();
    sessions.set(digest(token), { expiresAt: Date.now() + 12 * 60 * 60 * 1000, pendingLink: null });
    res.setHeader('Set-Cookie', cookieName + '=' + encodeURIComponent(token) + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200' + secure);
    res.redirect(303, '/dashboard');
  });
  app.post('/dashboard/logout', (req, res) => {
    const found = requireSession(req, res);
    if (found) sessions.delete(found.key);
    res.setHeader('Set-Cookie', cookieName + '=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + secure);
    res.redirect(303, '/dashboard');
  });
  app.post('/dashboard/devices/new', (req, res) => {
    const found = requireSession(req, res); if (!found) return;
    const active = deviceList();
    if (active.length >= maxDevices) { render(req, res, 'Device limit reached (' + maxDevices + '). Revoke an old device first.'); return; }
    const displayName = String(req.body?.displayName || '').trim().slice(0, 40);
    if (!displayName) { render(req, res, 'Enter a device name.'); return; }
    const alias = uniqueAlias(req.body?.alias || displayName);
    const id = randomUUID();
    const record = { id, alias, displayName, tokenHash: '', createdAt: now(), lastSeen: null, revokedAt: null, tools: [], platform: 'unknown', agentVersion: null, protected: false, source: 'dashboard' };
    db.devices[id] = record;
    createPair(record, found);
    res.redirect(303, '/dashboard');
  });
  app.post('/dashboard/devices/:id/rotate', (req, res) => {
    const found = requireSession(req, res); if (!found) return;
    const record = db.devices[req.params.id];
    if (!record || record.revokedAt) { render(req, res, 'Unknown or revoked device.'); return; }
    const live = devices.get(record.id); if (live) live.ws.close(4001, 'Pairing key rotated');
    const token = random(); record.tokenHash = digest(token); record.revokedAt = null; record.updatedAt = now();
    issuePair(found, record, token); save(); onChange(); res.redirect(303, '/dashboard');
  });
  app.post('/dashboard/devices/:id/revoke', (req, res) => {
    const found = requireSession(req, res); if (!found) return;
    const record = db.devices[req.params.id];
    if (!record) { render(req, res, 'Unknown device.'); return; }
    record.revokedAt = now();
    if (db.defaultDeviceId === record.id) db.defaultDeviceId = deviceList().find(d => d.id !== record.id)?.id || '';
    const live = devices.get(record.id); if (live) live.ws.close(4003, 'Device revoked');
    save(); onChange(); res.redirect(303, '/dashboard');
  });
  app.post('/dashboard/devices/revoke-all', (req, res) => {
    const found = requireSession(req, res); if (!found) return;
    if (req.body?.confirm !== 'yes') { render(req, res, 'Confirm that all devices should be revoked.'); return; }
    for (const record of deviceList()) {
      record.revokedAt = now();
      const live = devices.get(record.id); if (live) live.ws.close(4003, 'Device revoked');
    }
    db.defaultDeviceId = deviceList()[0]?.id || '';
    save(); onChange(); res.redirect(303, '/dashboard');
  });
  app.post('/dashboard/devices/:id/default', (req, res) => {
    const found = requireSession(req, res); if (!found) return;
    const record = db.devices[req.params.id];
    if (!record || record.revokedAt) { render(req, res, 'Unknown or revoked device.'); return; }
    db.defaultDeviceId = record.id; save(); onChange(); res.redirect(303, '/dashboard');
  });
  app.post('/dashboard/clients/:id/revoke', (req, res) => {
    const found = requireSession(req, res); if (!found) return;
    const id = req.params.id;
    delete db.clients[id];
    for (const collection of ['access', 'refresh', 'codes']) {
      for (const [key, value] of Object.entries(db[collection] || {})) if (value.clientId === id) delete db[collection][key];
    }
    save(); res.redirect(303, '/dashboard');
  });
  app.get('/pair/:token', (req, res) => {
    const token = String(req.params.token || '');
    const hash = digest(token);
    const record = Object.values(db.devices || {}).find(d => d.tokenHash === hash && !d.revokedAt);
    if (!record) { res.status(404).type('html').send('<!doctype html><title>Pairing link unavailable</title><h1>Pairing link unavailable</h1><p>This device link is invalid, expired or revoked.</p>'); return; }
    res.type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private device pairing</title><style>body{font:16px system-ui;max-width:600px;margin:10vh auto;padding:24px;background:#0b1220;color:#edf2f7}section{background:#121d30;border:1px solid #29364d;border-radius:12px;padding:24px}p{color:#a8b4c8}</style><section><h1>Private device pairing link</h1><p>Device: <b>' + esc(record.displayName) + '</b></p><p>Use this full URL only with the Karis Desktop Commander agent on the computer you want to pair. Do not paste it into a public chat or share it; it is a private pairing credential.</p><p>The AI connector uses the separate OAuth endpoint at <code>' + esc(issuer.origin + '/mcp') + '</code>.</p></section></html>');
  });
}
