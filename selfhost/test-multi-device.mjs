import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relayFile = path.join(sourceRoot, 'selfhost', 'relay.mjs');
const tempRoot = '/home/ubuntu/workspace/temp/desktop-commander-selfhost';
fs.mkdirSync(tempRoot, { recursive: true, mode: 0o700 });
const testDir = fs.mkdtempSync(path.join(tempRoot, 'multi-device-'));
const randomSecret = () => randomBytes(36).toString('base64url');
const adminKey = randomSecret(), agentKey = randomSecret(), linkKey = randomSecret();
for (const [name, value] of [['admin.key', adminKey], ['agent.key', agentKey], ['link.key', linkKey]]) {
  fs.writeFileSync(path.join(testDir, name), value + '\n', { mode: 0o600, flag: 'wx' });
}
const freePort = async () => {
  const s = net.createServer();
  await new Promise((resolve, reject) => { s.once('error', reject); s.listen(0, '127.0.0.1', resolve); });
  const p = s.address().port;
  await new Promise(resolve => s.close(resolve));
  return p;
};
const port = await freePort();
const root = 'http://127.0.0.1:' + port;
const relayLog = fs.createWriteStream(path.join(testDir, 'relay.log'), { flags: 'wx', mode: 0o600 });
const child = spawn(process.execPath, [relayFile], {
  cwd: sourceRoot,
  env: {
    ...process.env,
    KARIS_BIND: '127.0.0.1',
    KARIS_PORT: String(port),
    KARIS_PUBLIC_URL: root,
    KARIS_DB_FILE: path.join(testDir, 'oauth.json'),
    KARIS_ADMIN_FILE: path.join(testDir, 'admin.key'),
    KARIS_AGENT_FILE: path.join(testDir, 'agent.key'),
    KARIS_LINK_KEY_FILE: path.join(testDir, 'link.key'),
    KARIS_VERSION: '0.3.4-karis.4',
    KARIS_AGENT_PACKAGE_URL: 'https://example.invalid/test-agent.tgz'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
child.stdout.pipe(relayLog);
child.stderr.pipe(relayLog);
const mocks = [];
let realAgent = null;
let client = null;
let clientConnected = false;
let scopedClient = null;
let scopedClientConnected = false;
let cookie = '';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForHealth() {
  const start = Date.now();
  while (Date.now() - start < 12000) {
    if (child.exitCode !== null) throw new Error('Test relay exited. Log: ' + fs.readFileSync(path.join(testDir, 'relay.log'), 'utf8'));
    try {
      const r = await fetch(root + '/healthz');
      if (r.ok) return await r.json();
    } catch {}
    await wait(100);
  }
  throw new Error('Test relay did not start. Log: ' + fs.readFileSync(path.join(testDir, 'relay.log'), 'utf8'));
}
async function addDevice(displayName, alias, simulateProxyHost = false) {
  const form = new URLSearchParams({ displayName, alias }).toString();
  let status;
  if (simulateProxyHost) {
    const target = new URL(root + '/dashboard/devices/new');
    status = await new Promise((resolve, reject) => {
      const request = http.request({
        hostname: target.hostname, port: target.port, path: target.pathname, method: 'POST',
        headers: {
          Cookie: cookie, Origin: root, 'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(form), Host: 'relay-internal.invalid:18791'
        }
      }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
      request.on('error', reject);
      request.end(form);
    });
  } else {
    const r = await fetch(root + '/dashboard/devices/new', {
      method: 'POST',
      headers: { Cookie: cookie, Origin: root, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      redirect: 'manual'
    });
    status = r.status;
  }
  assert.equal(status, 303, 'create device must redirect even when proxy rewrites Host');
  const page = await fetch(root + '/dashboard', { headers: { Cookie: cookie } });
  assert.equal(page.status, 200);
  const html = await page.text();
  const match = html.match(/\/pair\/([A-Za-z0-9_-]{40,})/);
  assert(match, 'dashboard should show one-time pairing link');
  return match[1];
}
async function mockAgent(token, label) {
  const ws = new WebSocket(root.replace('http:', 'ws:') + '/agent', { headers: { Authorization: 'Bearer ' + token } });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.on('error', () => {});
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg.id) return;
    if (msg.kind === 'ping') {
      ws.send(JSON.stringify({ kind: 'response', id: msg.id, result: { content: [{ type: 'text', text: 'pong:' + label }] } }));
      return;
    }
    if (msg.kind === 'shutdown') {
      ws.send(JSON.stringify({ kind: 'response', id: msg.id, result: { content: [{ type: 'text', text: 'shutdown:' + label }] } }));
      setTimeout(() => ws.close(1000, 'test shutdown'), 30);
      return;
    }
    if (msg.kind === 'call') {
      const value = msg.args?.arguments?.value || '';
      ws.send(JSON.stringify({ kind: 'response', id: msg.id, result: { content: [{ type: 'text', text: label + ':' + value }] } }));
    }
  });
  ws.send(JSON.stringify({
    kind: 'register', deviceId: randomUUID(), name: 'untrusted-name',
    platform: label.startsWith('pc') ? 'win32' : 'darwin',
    agentVersion: 'test',
    tools: [{
      name: 'probe', description: 'Harmless multi-device routing probe.',
      inputSchema: { type: 'object', properties: { value: { type: 'string' } }, additionalProperties: false },
      annotations: { title: 'Probe', readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    }]
  }));
  mocks.push(ws);
  return ws;
}
async function oauthClient() {
  const meta = await (await fetch(root + '/.well-known/oauth-authorization-server')).json();
  const reg = await fetch(root + '/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Karis multi-device E2E',
      redirect_uris: ['http://127.0.0.1:18799/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code']
    })
  });
  const rc = await reg.json();
  assert.equal(reg.status, 201, JSON.stringify(rc));
  const verifier = randomBytes(36).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const auth = new URL(meta.authorization_endpoint);
  for (const [k, v] of Object.entries({
    client_id: rc.client_id, redirect_uri: 'http://127.0.0.1:18799/callback',
    response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256',
    state: 'multi-device-test', scope: 'mcp', resource: root + '/mcp'
  })) auth.searchParams.set(k, v);
  const page = await fetch(auth);
  assert.equal(page.status, 200);
  const html = await page.text();
  const requestId = html.match(/name="request" value="([^"]+)"/)?.[1];
  assert(requestId);
  const approved = await fetch(root + '/approve', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ request: requestId, password: adminKey }), redirect: 'manual'
  });
  assert.equal(approved.status, 302);
  const callback = new URL(approved.headers.get('location'));
  assert.equal(callback.searchParams.get('state'), 'multi-device-test');
  const tokenRes = await fetch(meta.token_endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: rc.client_id,
      code: callback.searchParams.get('code'), code_verifier: verifier,
      redirect_uri: 'http://127.0.0.1:18799/callback', resource: root + '/mcp'
    })
  });
  const token = await tokenRes.json();
  assert.equal(tokenRes.status, 200, JSON.stringify(token));
  return token.access_token;
}

try {
  const health = await waitForHealth();
  assert.equal(health.quota, 'none');
  const unauth = await fetch(root + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(unauth.status, 401);
  const login = await fetch(root + '/dashboard/login', {
    method: 'POST', headers: { Origin: root, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password: adminKey }), redirect: 'manual'
  });
  assert.equal(login.status, 303);
  cookie = login.headers.get('set-cookie').split(';')[0];
  const page = await fetch(root + '/dashboard', { headers: { Cookie: cookie } });
  assert.equal(page.status, 200);
  const pageHtml = await page.text();
  const csrfToken = pageHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert(csrfToken && csrfToken.length >= 32, 'dashboard forms must receive a session-bound CSRF token');

  const crossOriginCreate = await fetch(root + '/dashboard/devices/new', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: 'https://attacker.example', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ displayName: 'Blocked Cross Origin', alias: 'blocked_origin' }),
    redirect: 'manual'
  });
  assert.equal(crossOriginCreate.status, 403, 'cross-origin device creation must remain blocked');
  const noOriginCreate = await fetch(root + '/dashboard/devices/new', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ displayName: 'Blocked Missing Origin', alias: 'blocked_no_origin' }),
    redirect: 'manual'
  });
  assert.equal(noOriginCreate.status, 403, 'requests without Origin or CSRF token must remain blocked');

  // Simulate Tailscale Funnel/reverse proxy rewriting Host to its private upstream
  // while the browser Origin remains the configured public issuer. This used to
  // reject valid same-origin dashboard form submissions.
  const proxyOriginCreate = await fetch(root + '/dashboard/devices/new', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: root, Host: 'private-upstream.internal', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ displayName: 'Proxy Host Regression', alias: 'proxy_host_test' }),
    redirect: 'manual'
  });
  assert.equal(proxyOriginCreate.status, 303, 'configured issuer Origin must be accepted when reverse proxy rewrites Host');
  const proxyDb = JSON.parse(fs.readFileSync(path.join(testDir, 'oauth.json'), 'utf8'));
  const proxyRecord = Object.values(proxyDb.devices).find(d => d.alias === 'proxy_host_test');
  assert(proxyRecord, 'same-origin device creation must succeed behind a Host-rewriting proxy');
  const proxyRevoke = await fetch(root + '/dashboard/devices/' + encodeURIComponent(proxyRecord.id) + '/revoke', {
    method: 'POST', headers: { Cookie: cookie, Origin: root }, redirect: 'manual'
  });
  assert.equal(proxyRevoke.status, 303, 'test device cleanup should succeed');
  const proxyDbAfterCleanup = JSON.parse(fs.readFileSync(path.join(testDir, 'oauth.json'), 'utf8'));
  assert(proxyDbAfterCleanup.devices[proxyRecord.id].revokedAt, 'test device must be revoked after proxy regression check');

  // A valid session-bound token must allow the legitimate dashboard form even
  // when an embedded browser/reverse-proxy setup supplies a mismatched Origin.
  const tokenProtectedCreate = await fetch(root + '/dashboard/devices/new', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: 'https://unexpected-browser-origin.invalid', Host: 'private-upstream.internal', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ displayName: 'CSRF Token Regression', alias: 'csrf_token_test', _csrf: csrfToken }),
    redirect: 'manual'
  });
  assert.equal(tokenProtectedCreate.status, 303, 'valid session CSRF token must survive mismatched browser Origin');
  const csrfDb = JSON.parse(fs.readFileSync(path.join(testDir, 'oauth.json'), 'utf8'));
  const csrfRecord = Object.values(csrfDb.devices).find(d => d.alias === 'csrf_token_test');
  assert(csrfRecord, 'valid CSRF token should allow device creation');
  const csrfRevoke = await fetch(root + '/dashboard/devices/' + encodeURIComponent(csrfRecord.id) + '/revoke', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: 'https://unexpected-browser-origin.invalid', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrfToken }),
    redirect: 'manual'
  });
  assert.equal(csrfRevoke.status, 303, 'CSRF token should protect revoke action too');
  const csrfDbAfterCleanup = JSON.parse(fs.readFileSync(path.join(testDir, 'oauth.json'), 'utf8'));
  assert(csrfDbAfterCleanup.devices[csrfRecord.id].revokedAt, 'CSRF regression device must be revoked after test');

  const pcOneToken = await addDevice('Kha Windows PC', 'pc_one', true);
  const pcTwoToken = await addDevice('Office Windows', 'pc_two');
  const macToken = await addDevice('Kha MacBook', 'macbook');
  const realAgentToken = await addDevice('Local Linux Agent', 'local_agent');
  const db = JSON.parse(fs.readFileSync(path.join(testDir, 'oauth.json'), 'utf8'));
  for (const token of [pcOneToken, pcTwoToken, macToken, realAgentToken]) assert(!JSON.stringify(db).includes(token), 'pairing tokens must not be stored in plaintext');

  await mockAgent(pcOneToken, 'pc_one');
  await mockAgent(pcTwoToken, 'pc_two');
  await mockAgent(macToken, 'macbook');
  const agentConfigDir = path.join(testDir, 'real-agent-config');
  const agentHome = path.join(testDir, 'real-agent-home');
  realAgent = spawn(process.execPath, [path.join(sourceRoot, 'dist', 'index.js'), 'remote', '--endpoint', root + '/pair/' + realAgentToken, '--name', 'local_agent', '--no-save'], {
    cwd: sourceRoot,
    env: { ...process.env, KARIS_AGENT_CONFIG_DIR: agentConfigDir, KARIS_MCP_HOME: agentHome, KARIS_VERSION: '0.3.4-karis.4' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  realAgent.stdout.pipe(relayLog);
  realAgent.stderr.pipe(relayLog);
  const agentWaitStart = Date.now();
  while (Date.now() - agentWaitStart < 12000) {
    const h = await (await fetch(root + '/healthz')).json();
    if (h.connectedDevices >= 4) break;
    if (realAgent.exitCode !== null) throw new Error('Real agent exited before pairing. Log: ' + fs.readFileSync(path.join(testDir, 'relay.log'), 'utf8'));
    await wait(100);
  }
  assert((await (await fetch(root + '/healthz')).json()).connectedDevices >= 4, 'real Desktop Commander agent should connect');

  const accessToken = await oauthClient();
  client = new Client({ name: 'karis-multi-device-test', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(root + '/mcp'), { requestInit: { headers: { Authorization: 'Bearer ' + accessToken } } });
  await client.connect(transport); clientConnected = true;
  const list = await client.listTools();
  assert(list.tools.some(t => t.name === 'probe'), 'device tools should be merged by name');
  assert(list.tools.some(t => t.name === 'get_config'), 'full local Desktop Commander tools should be exposed');
  assert(list.tools.some(t => t.name === 'list_paired_devices'));
  const commonTargetSchema = list.tools.find(t => t.name === 'probe').inputSchema.properties.target_device;
  assert.equal(commonTargetSchema.type, 'string');
  assert.equal(Object.hasOwn(commonTargetSchema, 'enum'), false, 'common endpoint must not freeze device aliases into a cached schema');
  assert.match(commonTargetSchema.description, /list_paired_devices/);
  assert.equal(Object.hasOwn(list.tools.find(t => t.name === 'get_config').inputSchema.properties.target_device, 'enum'), false);

  for (const alias of ['pc_one', 'pc_two', 'macbook']) {
    const result = await client.callTool({ name: 'probe', arguments: { target_device: alias, value: 'ok' } });
    assert(!result.isError, JSON.stringify(result));
    assert.equal(result.content[0].text, alias + ':ok');
  }
  const realTool = await client.callTool({ name: 'get_config', arguments: { target_device: 'local_agent' } });
  assert(!realTool.isError, 'real local Desktop Commander tool should execute through the relay: ' + JSON.stringify(realTool));

  // A device-scoped link lets clients with fixed tool schemas control one
  // machine without changing the relay-wide default device.
  scopedClient = new Client({ name: 'karis-device-scoped-test', version: '1.0.0' }, { capabilities: {} });
  const scopedTransport = new StreamableHTTPClientTransport(new URL(root + '/mcp/' + linkKey + '/device/pc_two'));
  await scopedClient.connect(scopedTransport); scopedClientConnected = true;
  const scopedTools = await scopedClient.listTools();
  assert.deepEqual(scopedTools.tools.find(t => t.name === 'probe').inputSchema.properties.target_device.enum, ['pc_two']);
  const scopedProbe = await scopedClient.callTool({ name: 'probe', arguments: { value: 'locked' } });
  assert(!scopedProbe.isError, JSON.stringify(scopedProbe));
  assert.equal(scopedProbe.content[0].text, 'pc_two:locked', 'device-scoped endpoint must route to its fixed target');
  const blockedSwitch = await scopedClient.callTool({ name: 'probe', arguments: { target_device: 'pc_one', value: 'wrong' } });
  assert(blockedSwitch.isError, 'device-scoped endpoint must reject attempts to switch devices');
  const blockedManagerSwitch = await scopedClient.callTool({ name: 'ping_device', arguments: { device_id: 'pc_one' } });
  assert(blockedManagerSwitch.isError, 'device-scoped endpoint must not ping another device');
  const scopedPing = await scopedClient.callTool({ name: 'ping_device', arguments: { device_id: 'pc_two' } });
  assert(!scopedPing.isError && scopedPing.content[0].text.includes('"responsive": true'));
  const badScopedPath = await fetch(root + '/mcp/' + linkKey + '/device/not-paired', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(badScopedPath.status, 404, 'device-scoped route must reject unknown aliases');

  const deviceListResult = await client.callTool({ name: 'list_paired_devices', arguments: {} });
  const deviceList = JSON.parse(deviceListResult.content[0].text);
  assert.equal(deviceList.length, 4);
  assert(deviceList.every(d => d.online));

  const ping = await client.callTool({ name: 'ping_device', arguments: { device_id: 'pc_two' } });
  assert(!ping.isError, JSON.stringify(ping));
  assert(ping.content[0].text.includes('"responsive": true'));

  const activity = await client.callTool({ name: 'get_recent_tool_activity', arguments: { limit: 10 } });
  const recent = JSON.parse(activity.content[0].text);
  assert(recent.some(a => a.tool === 'probe' && a.device === 'macbook'));
  assert(recent.some(a => a.tool === 'ping_device' && a.device === 'pc_two'));
  const usage = await client.callTool({ name: 'get_usage_statistics', arguments: {} });
  const stats = JSON.parse(usage.content[0].text);
  assert.equal(stats.quota, 'none');
  assert(stats.totalToolCalls >= 4);
  const dashboardAfterCalls = await (await fetch(root + '/dashboard', { headers: { Cookie: cookie } })).text();
  assert(dashboardAfterCalls.includes('Usage and recent activity'));
  assert(dashboardAfterCalls.includes('probe'));

  const revoke = await fetch(root + '/dashboard/devices/' + encodeURIComponent(deviceList.find(d => d.alias === 'pc_two').id) + '/revoke', {
    method: 'POST', headers: { Cookie: cookie, Origin: root }, redirect: 'manual'
  });
  assert.equal(revoke.status, 303);
  const denied = new WebSocket(root.replace('http:', 'ws:') + '/agent', { headers: { Authorization: 'Bearer ' + pcTwoToken } });
  const deniedStatus = await new Promise(resolve => {
    denied.once('unexpected-response', (_req, response) => resolve(response.statusCode));
    denied.once('open', () => { denied.close(); resolve(101); });
    denied.once('error', () => resolve(0));
  });
  assert.equal(deniedStatus, 401, 'revoked device token must no longer pair');

  const afterRevoke = await client.callTool({ name: 'list_paired_devices', arguments: {} });
  const active = JSON.parse(afterRevoke.content[0].text);
  assert.equal(active.length, 3);
  assert(!active.some(d => d.alias === 'pc_two'));

  const shutdown = await client.callTool({ name: 'shutdown_device_agent', arguments: { device_id: 'macbook' } });
  assert(!shutdown.isError, JSON.stringify(shutdown));
  assert(shutdown.content[0].text.includes('shutdown:macbook'));
  const shutdownReal = await client.callTool({ name: 'shutdown_device_agent', arguments: { device_id: 'local_agent' } });
  assert(!shutdownReal.isError, JSON.stringify(shutdownReal));
  await wait(200);

  const revokeAll = await fetch(root + '/dashboard/devices/revoke-all', {
    method: 'POST', headers: { Cookie: cookie, Origin: root, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ confirm: 'yes' }), redirect: 'manual'
  });
  assert.equal(revokeAll.status, 303);
  const empty = await client.callTool({ name: 'list_paired_devices', arguments: {} });
  assert.equal(JSON.parse(empty.content[0].text).length, 0);

  console.log('PASS: multi-device pairing; OAuth MCP; target_device routing; fixed per-device MCP link with cross-device denial; usage/activity; ping/shutdown; individual revoke and revoke-all; no monthly quota.');
} finally {
  if (scopedClientConnected) await scopedClient.close().catch(() => {});
  if (clientConnected) await client.close().catch(() => {});
  if (realAgent && realAgent.exitCode === null) {
    realAgent.kill('SIGTERM');
    await Promise.race([new Promise(resolve => realAgent.once('exit', resolve)), wait(4000)]);
    if (realAgent.exitCode === null) realAgent.kill('SIGKILL');
  }
  for (const ws of mocks) { try { ws.close(1000, 'test cleanup'); } catch {} }
  await wait(150);
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), wait(4000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  relayLog.end();
  fs.rmSync(testDir, { recursive: true, force: true });
}
