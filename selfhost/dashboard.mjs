import { randomUUID } from 'node:crypto';
import { renderLoginView, renderConsoleView } from './dashboard-view.mjs';

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
    try {
      const origin = new URL(req.headers.origin).origin;
      // The reverse proxy can rewrite Host to its private upstream address.
      // Trust the explicitly configured public issuer, not arbitrary forwarded headers.
      if (origin === issuer.origin) return true;
      // Permit direct browser access only when the request is explicitly loopback-local.
      const requestOrigin = new URL(`${req.protocol}://${req.get('host')}`);
      return ['127.0.0.1', 'localhost', '[::1]'].includes(requestOrigin.hostname)
        && origin === requestOrigin.origin;
    } catch { return false; }
  }
  function loginPage(message = '') { return renderLoginView(message); }
  function deviceList() {
    return Object.values(db.devices || {}).filter(d => !d.revokedAt).sort((a,b) => {
      if (a.protected !== b.protected) return a.protected ? -1 : 1;
      return String(a.displayName).localeCompare(String(b.displayName));
    });
  }
  function render(req, res, message = '') {
    const found = sessionFor(req);
    if (!found) { res.status(401).type('html').send(loginPage()); return; }
    const session = found.session;
    let pendingLink = null;
    if (session.pendingLink && session.pendingLink.expiresAt > Date.now()) {
      const p = session.pendingLink;
      session.pendingLink = null;
      const url = issuer.origin + '/pair/' + p.token;
      const command = 'npx --yes --package=' + agentPackageUrl + ' desktop-commander remote --endpoint ' + url + ' --name ' + p.alias;
      pendingLink = { url, command, displayName: p.displayName };
    }
    const list = deviceList().map(d => {
      const live = devices.get(d.id);
      return {
        id: d.id, alias: d.alias, displayName: d.displayName, platform: d.platform,
        online: !!live && live.ws?.readyState === 1, toolCount: (d.tools || []).length,
        lastSeen: d.lastSeen, isDefault: db.defaultDeviceId === d.id, protected: !!d.protected
      };
    });
    const html = renderConsoleView({
      list, clients: Object.values(db.clients || {}), activities: db.activity || [],
      usageTotal: Number(db.usage?.totalCalls) || 0, maxDevices,
      endpoint: issuer.origin + '/mcp', pendingLink, message, csrfToken: session.csrfToken,
      view: req.query?.view || (req.path.includes('revoke-all') ? 'security' : req.path.includes('/devices') ? 'devices' : req.path.includes('/clients') ? 'clients' : 'overview')
    });
    res.status(200).type('html').send(html);
  }
  function requireSession(req, res) {
    const found = sessionFor(req);
    if (!found) { res.status(401).type('html').send(loginPage('Your session expired. Please sign in again.')); return null; }
    const suppliedCsrf = req.body?._csrf;
    const validCsrf = typeof suppliedCsrf === 'string' && equal(suppliedCsrf, found.session.csrfToken || '');
    // Browsers behind some reverse-proxy/webview setups can send an Origin that
    // differs from the configured public issuer. A session-bound token is the
    // primary CSRF proof; retain the Origin check as a fallback for legacy forms.
    const sameOriginRequest = Boolean(req.headers.origin) && sameOrigin(req);
    if (!validCsrf && !sameOriginRequest) { res.status(403).send('Cross-origin request rejected'); return null; }
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
    sessions.set(digest(token), { expiresAt: Date.now() + 12 * 60 * 60 * 1000, pendingLink: null, csrfToken: random() });
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
    res.redirect(303, '/dashboard?view=devices');
  });
  app.post('/dashboard/devices/:id/rotate', (req, res) => {
    const found = requireSession(req, res); if (!found) return;
    const record = db.devices[req.params.id];
    if (!record || record.revokedAt) { render(req, res, 'Unknown or revoked device.'); return; }
    const live = devices.get(record.id); if (live) live.ws.close(4001, 'Pairing key rotated');
    const token = random(); record.tokenHash = digest(token); record.revokedAt = null; record.updatedAt = now();
    issuePair(found, record, token); save(); onChange(); res.redirect(303, '/dashboard?view=devices');
  });
  app.post('/dashboard/devices/:id/revoke', (req, res) => {
    const found = requireSession(req, res); if (!found) return;
    const record = db.devices[req.params.id];
    if (!record) { render(req, res, 'Unknown device.'); return; }
    record.revokedAt = now();
    if (db.defaultDeviceId === record.id) db.defaultDeviceId = deviceList().find(d => d.id !== record.id)?.id || '';
    const live = devices.get(record.id); if (live) live.ws.close(4003, 'Device revoked');
    save(); onChange(); res.redirect(303, '/dashboard?view=devices');
  });
  app.post('/dashboard/devices/revoke-all', (req, res) => {
    const found = requireSession(req, res); if (!found) return;
    if (req.body?.confirm !== 'yes') { render(req, res, 'Confirm that all devices should be revoked.'); return; }
    for (const record of deviceList()) {
      record.revokedAt = now();
      const live = devices.get(record.id); if (live) live.ws.close(4003, 'Device revoked');
    }
    db.defaultDeviceId = deviceList()[0]?.id || '';
    save(); onChange(); res.redirect(303, '/dashboard?view=security');
  });
  app.post('/dashboard/devices/:id/default', (req, res) => {
    const found = requireSession(req, res); if (!found) return;
    const record = db.devices[req.params.id];
    if (!record || record.revokedAt) { render(req, res, 'Unknown or revoked device.'); return; }
    db.defaultDeviceId = record.id; save(); onChange(); res.redirect(303, '/dashboard?view=devices');
  });
  app.post('/dashboard/clients/:id/revoke', (req, res) => {
    const found = requireSession(req, res); if (!found) return;
    const id = req.params.id;
    delete db.clients[id];
    for (const collection of ['access', 'refresh', 'codes']) {
      for (const [key, value] of Object.entries(db[collection] || {})) if (value.clientId === id) delete db[collection][key];
    }
    save(); res.redirect(303, '/dashboard?view=clients');
  });
  app.get('/pair/:token', (req, res) => {
    const token = String(req.params.token || '');
    const hash = digest(token);
    const record = Object.values(db.devices || {}).find(d => d.tokenHash === hash && !d.revokedAt);
    if (!record) { res.status(404).type('html').send('<!doctype html><title>Pairing link unavailable</title><h1>Pairing link unavailable</h1><p>This device link is invalid, expired or revoked.</p>'); return; }
    res.type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private device pairing</title><style>body{font:16px system-ui;max-width:600px;margin:10vh auto;padding:24px;background:#0b1220;color:#edf2f7}section{background:#121d30;border:1px solid #29364d;border-radius:12px;padding:24px}p{color:#a8b4c8}</style><section><h1>Private device pairing link</h1><p>Device: <b>' + esc(record.displayName) + '</b></p><p>Use this full URL only with the Karis Desktop Commander agent on the computer you want to pair. Do not paste it into a public chat or share it; it is a private pairing credential.</p><p>The AI connector uses the separate OAuth endpoint at <code>' + esc(issuer.origin + '/mcp') + '</code>.</p></section></html>');
  });
}
