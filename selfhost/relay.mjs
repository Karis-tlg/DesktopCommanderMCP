import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { registerDashboard } from './dashboard.mjs';

const addr = process.env.KARIS_PUBLIC_URL || 'http://127.0.0.1:18791';
const issuer = new URL(addr);
if (issuer.pathname !== '/' || issuer.search || issuer.hash) throw Error('KARIS_PUBLIC_URL must be only the origin');
if (issuer.protocol !== 'https:' && !['127.0.0.1','localhost','[::1]'].includes(issuer.hostname)) throw Error('HTTPS is required for non-loopback endpoint');
const resource = new URL('/mcp', issuer);
const bind = process.env.KARIS_BIND || '127.0.0.1';
const port = Number(process.env.KARIS_PORT || 18791);
const dbPath = process.env.KARIS_DB_FILE;
const adminFile = process.env.KARIS_ADMIN_FILE;
const agentFile = process.env.KARIS_AGENT_FILE;
const linkKeyFile = process.env.KARIS_LINK_KEY_FILE;
if (!dbPath || !adminFile || !agentFile || !linkKeyFile) throw Error('Missing private relay file configuration');
const secret = (f) => fs.readFileSync(f,'utf8').trim();
const adminKey = secret(adminFile), agentKey = secret(agentFile), linkKey = secret(linkKeyFile);
if (adminKey.length < 32 || agentKey.length < 32 || linkKey.length < 40) throw Error('Generated secrets are missing or too short');
const random = () => randomBytes(32).toString('base64url');
const digest = s => createHash('sha256').update(s).digest('hex');
const equal = (a,b) => { const x=Buffer.from(digest(a),'hex'), y=Buffer.from(digest(b),'hex'); return timingSafeEqual(x,y); };
const now = () => Math.floor(Date.now()/1000);
let db = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath,'utf8')) : {clients:{},codes:{},access:{},refresh:{},devices:{},activity:[],usage:{totalCalls:0,byDevice:{},byTool:{},lastCallAt:null}};
if (!db.devices || typeof db.devices !== 'object') db.devices = {};
if (!Array.isArray(db.activity)) db.activity = [];
if (!db.usage || typeof db.usage !== 'object') db.usage = {totalCalls:0,byDevice:{},byTool:{},lastCallAt:null};
if (!Number.isFinite(db.usage.totalCalls)) db.usage.totalCalls = 0;
if (!db.usage.byDevice || typeof db.usage.byDevice !== 'object') db.usage.byDevice = {};
if (!db.usage.byTool || typeof db.usage.byTool !== 'object') db.usage.byTool = {};
if (!db.defaultDeviceId) db.defaultDeviceId = 'vps';
const save = () => { const dir=path.dirname(dbPath); fs.mkdirSync(dir,{recursive:true,mode:0o700}); const f=dbPath+'.'+process.pid+'.tmp'; fs.writeFileSync(f,JSON.stringify(db),{mode:0o600,flag:'wx'}); fs.renameSync(f,dbPath); };
const cleanup = () => { for(const col of ['codes','access','refresh']) for(const [k,v] of Object.entries(db[col])) if(v.exp < now()) delete db[col][k]; };
const expectedResource = (u) => !u || u.toString() === resource.toString();
const issue = (clientId, scopes=['mcp']) => {
  const a=random(), r=random();
  db.access[digest(a)]={clientId,scopes,exp:now()+3600};
  db.refresh[digest(r)]={clientId,scopes,exp:now()+30*86400}; save();
  return { access_token:a, refresh_token:r, token_type:'Bearer', expires_in:3600, scope:scopes.join(' ') };
};
const pending = new Map();
const clientsStore = {
 getClient: async id => db.clients[id],
 registerClient: async client => {
   if(Object.keys(db.clients).length>=64) throw Error('Client registration capacity exceeded');
   const id=random();
   const c={...client,client_id:id,client_id_issued_at:now(),client_secret_expires_at:0,token_endpoint_auth_method:'none'};
   db.clients[id]=c; save(); return c;
 }
};
const provider = {
 get clientsStore(){return clientsStore},
 authorize: async (client, params, res) => {
   if(!expectedResource(params.resource) || (params.scopes||[]).some(scope=>scope!=='mcp')) {res.status(400).send('Invalid OAuth resource or scope');return;}
   const id=random(); pending.set(id,{clientId:client.client_id,params,exp:now()+300});
   const name=esc(client.client_name||'Unnamed MCP client');
   res.status(200).type('html').send(`<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Authorize Karis MCP</title><style>body{font:16px system-ui;max-width:440px;margin:12vh auto;padding:24px;background:#101820;color:#fff}input,button{font:inherit;padding:12px;margin-top:12px;width:100%;box-sizing:border-box}button{background:#15803d;color:white;border:0;border-radius:6px}small{color:#aaa}</style><h2>Authorize ${name}</h2><p>This application is requesting access to run file and terminal MCP tools on your connected device.</p><small>Only approve a client you trust. This grants powerful device access.</small><form action="/approve" method="post"><input type="hidden" name="request" value="${id}"><label>Admin approval password<input type="password" name="password" autocomplete="off" required></label><button type="submit">Authorize for 30 days</button></form>`);
 },
 challengeForAuthorizationCode: async (_client,code) => {const entry=db.codes[digest(code)]; if(!entry||entry.exp<=now()) throw new InvalidGrantError('Expired authorization code'); return entry.challenge;},
 exchangeAuthorizationCode: async (client,code,_verifier,redirect,tokenResource) => {
   const key=digest(code), e=db.codes[key]; if(!e||e.exp<=now()||e.clientId!==client.client_id||e.redirect!==redirect||!expectedResource(tokenResource)|| (tokenResource && e.resource!==tokenResource.toString())) throw new InvalidGrantError('Invalid code');
   delete db.codes[key]; return issue(client.client_id,e.scopes);
 },
 exchangeRefreshToken: async (client,token,scopes,tokenResource) => {
   const key=digest(token),e=db.refresh[key];if(!e||e.exp<=now()||e.clientId!==client.client_id||!expectedResource(tokenResource)) throw new InvalidGrantError('Invalid refresh token');
   if(scopes && scopes.some(s=>!e.scopes.includes(s))) throw new InvalidGrantError('Invalid scopes');
   delete db.refresh[key]; return issue(client.client_id,scopes||e.scopes);
 },
 verifyAccessToken: async token => {
   const t=db.access[digest(token)]; if(!t||t.exp<=now()) throw new InvalidTokenError('Invalid or expired access token');
   return {token,clientId:t.clientId,scopes:t.scopes,expiresAt:t.exp,resource};
 },
 revokeToken: async (client,request) => {
   const k=digest(request.token); if(db.access[k]?.clientId===client.client_id)delete db.access[k];if(db.refresh[k]?.clientId===client.client_id)delete db.refresh[k];save();
 }
};
const esc = str => String(str).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app=express();app.disable('x-powered-by');app.set('trust proxy', 'loopback');app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");next();});
app.use(express.json({limit:'1mb'}));app.use(express.urlencoded({extended:false,limit:'16kb'}));
app.use(mcpAuthRouter({provider,issuerUrl:issuer,resourceServerUrl:resource,scopesSupported:['mcp'],resourceName:'Karis Desktop Commander MCP'}));
let failures=new Map();
app.post('/approve', (req,res)=>{
 const ip=req.socket.remoteAddress||'local', f=failures.get(ip)||{n:0,exp:now()+900};if(f.exp<now()){f.n=0;f.exp=now()+900;}
 if(f.n>=8){res.status(429).send('Too many attempts');return;}
 const id=String(req.body?.request||''), entry=pending.get(id);
 if(!entry || entry.exp<now()){res.status(400).send('Authorization expired');return;}
 if(typeof req.body?.password !== 'string' || !equal(req.body.password,adminKey)){f.n++; failures.set(ip,f);res.status(403).send('Approval denied');return;}
 pending.delete(id);failures.delete(ip);const code=random();const p=entry.params;
 db.codes[digest(code)]={clientId:entry.clientId,challenge:p.codeChallenge,redirect:p.redirectUri,scopes:p.scopes||['mcp'],resource:p.resource?.toString(),exp:now()+300};save();
 const destination=new URL(p.redirectUri);destination.searchParams.set('code',code);if(p.state) destination.searchParams.set('state',p.state);res.redirect(302,destination.href);
});
app.get('/settings',(_req,res)=>res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Karis MCP Settings</title><style>body{font:16px system-ui;max-width:600px;margin:8vh auto;padding:25px;background:#101820;color:white}input,button{font:inherit;padding:10px;margin:8px 0}button{background:#245b6f;color:white;border:0;border-radius:5px}</style><h1>Client permissions</h1><p>Manage OAuth clients connected to your private MCP. The admin password is required for each operation.</p><form method="post" action="/settings"><input type="password" name="password" required autocomplete="off" placeholder="Admin password"><button type="submit" name="action" value="list">Show connected clients</button></form>`));
app.post('/settings',(req,res)=>{
 const ip=req.socket.remoteAddress||'local',f=failures.get(ip)||{n:0,exp:now()+900};if(f.exp<now()){f.n=0;f.exp=now()+900;}
 if(f.n>=8){res.status(429).send('Too many attempts');return;}
 if(typeof req.body?.password!=='string'||!equal(req.body.password,adminKey)){f.n++;failures.set(ip,f);res.status(403).send('Access denied');return;}
 failures.delete(ip);
 const action=req.body?.action;
 if(action==='revoke'){
  const id=String(req.body?.client||'');
  if(db.clients[id]) {delete db.clients[id];for(const col of ['access','refresh','codes']) for(const[k,v]of Object.entries(db[col]))if(v.clientId===id)delete db[col][k];save();}
 }
 const list=Object.values(db.clients).map(c=>`<li><b>${esc(c.client_name||'Unnamed MCP client')}</b><small> · ${esc(c.client_id.slice(0,10))}…</small><form method="post" action="/settings"><input type="hidden" name="client" value="${esc(c.client_id)}"><input type="password" name="password" required autocomplete="off" placeholder="Admin password"><button type="submit" name="action" value="revoke">Revoke this client</button></form></li>`).join('');
 res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Karis MCP Settings</title><style>body{font:16px system-ui;max-width:700px;margin:8vh auto;padding:25px;background:#101820;color:white}li{margin:20px 0}input,button{font:inherit;padding:10px;margin:8px}button{background:#245b6f;color:white;border:0;border-radius:5px}</style><h1>Connected OAuth clients</h1><p>${Object.keys(db.clients).length} clients registered. Revoke removes all of a client's access and refresh tokens.</p><ul>${list}</ul><p><a href="/settings">Back</a></p>`);
});
// Multi-device registry, routing and management tools.
const MAX_DEVICES = 32;
if (!db.devices || typeof db.devices !== 'object') db.devices = {};
if (!db.defaultDeviceId) db.defaultDeviceId = 'vps';
const devices = new Map();
const waiting = new Map();
const toolMap = new Map();
let tools = [];

const sanitizeAlias = name => String(name || 'device').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'device';
const activeRecords = () => Object.values(db.devices).filter(d => d && !d.revokedAt);
const recordFor = selector => {
  const records = activeRecords();
  const value = String(selector || db.defaultDeviceId || '').trim().toLowerCase();
  return records.find(d => d.id === selector || d.alias.toLowerCase() === value || d.displayName.toLowerCase() === value) || null;
};
const viewDevice = d => {
  const live = devices.get(d.id);
  return {
    id: d.id, alias: d.alias, name: d.displayName,
    online: !!live && live.ws.readyState === 1,
    status: live && live.ws.readyState === 1 ? 'online' : 'offline',
    lastSeen: d.lastSeen ? new Date(d.lastSeen * 1000).toISOString() : null,
    createdAt: d.createdAt ? new Date(d.createdAt * 1000).toISOString() : null,
    platform: d.platform || 'unknown', agentVersion: d.agentVersion || null,
    toolCount: Array.isArray(d.tools) ? d.tools.length : 0,
    isDefault: db.defaultDeviceId === d.id, protected: !!d.protected
  };
};
const sanitizeTool = t => ({
  name: t.name,
  description: String(t.description || t.name).slice(0, 900),
  inputSchema: t.inputSchema?.type === 'object' ? JSON.parse(JSON.stringify(t.inputSchema)) : { type: 'object', properties: {} },
  annotations: {
    title: String(t.annotations?.title || t.name).slice(0, 120),
    readOnlyHint: t.annotations?.readOnlyHint === true,
    destructiveHint: t.annotations?.destructiveHint === true,
    openWorldHint: t.annotations?.openWorldHint === true
  }
});
const managerTools = [
  { name: 'list_paired_devices', description: 'List all paired computers, their aliases, online/offline status, last-seen time, platform and available tool count.', inputSchema: { type: 'object', properties: {} }, annotations: { title: 'List Paired Devices', readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
  { name: 'get_current_user_info', description: 'Get self-host service information, connected devices, authorized MCP clients and quota status.', inputSchema: { type: 'object', properties: {} }, annotations: { title: 'Current User Info', readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
  { name: 'ping_device', description: 'Check whether a paired device is responsive. Pass its alias or id in device_id.', inputSchema: { type: 'object', properties: { device_id: { type: 'string', description: 'Device alias or id, e.g. vps or kha_pc.' } }, required: ['device_id'] }, annotations: { title: 'Ping Device', readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
  { name: 'shutdown_device_agent', description: 'Gracefully stop a paired device agent. Stopping the VPS agent also removes VPS tools until its systemd service is restarted.', inputSchema: { type: 'object', properties: { device_id: { type: 'string', description: 'Device alias or id.' } }, required: ['device_id'] }, annotations: { title: 'Shutdown Device Agent', readOnlyHint: false, destructiveHint: true, openWorldHint: false } },
  { name: 'get_prompt_library', description: 'Get the self-host Desktop Commander prompt library and examples for safe file, terminal and multi-device workflows.', inputSchema: { type: 'object', properties: {} }, annotations: { title: 'Get Prompt Library', readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
  { name: 'submit_feedback', description: 'Save feedback locally for the self-host operator. Feedback is not uploaded to the original hosted service.', inputSchema: { type: 'object', properties: { message: { type: 'string', description: 'Feedback or issue report, maximum 4000 characters.' } }, required: ['message'] }, annotations: { title: 'Submit Feedback', readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
  { name: 'get_recent_tool_activity', description: 'Show recent self-host tool calls with device, tool, result status and duration. Arguments and file contents are not recorded.', inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Number of recent events to return, 20 by default.' } } }, annotations: { title: 'Get Recent Tool Activity', readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
  { name: 'get_usage_statistics', description: 'Get self-host lifetime tool-call totals by device and tool. This service does not enforce the vendor 10,000 calls/month quota.', inputSchema: { type: 'object', properties: {} }, annotations: { title: 'Get Usage Statistics', readOnlyHint: true, destructiveHint: false, openWorldHint: false } }
];

const rebuildTools = () => {
  tools = [];
  toolMap.clear();
  const records = activeRecords();
  const defaultRecord = records.find(d => d.id === db.defaultDeviceId) || records.find(d => d.protected) || records[0] || null;
  const aliases = records.map(d => d.alias);
  const descriptions = records.map(d => d.alias + ' (' + d.displayName + ')').join(', ') || 'no paired devices';
  const unique = new Map();
  for (const record of records) {
    for (const t of Array.isArray(record.tools) ? record.tools : []) {
      if (t && typeof t.name === 'string' && !unique.has(t.name)) unique.set(t.name, t);
    }
  }
  for (const [name, source] of unique) {
    const schema = JSON.parse(JSON.stringify(source.inputSchema || { type: 'object', properties: {} }));
    if (schema.type !== 'object') { schema.type = 'object'; schema.properties = {}; }
    schema.properties = schema.properties || {};
    schema.properties.target_device = {
      type: 'string',
      enum: aliases,
      description: 'Choose the machine by alias. Available: ' + descriptions + '. If omitted, uses the default device ' + (defaultRecord?.alias || 'none') + '.'
    };
    const tool = { ...source, name, inputSchema: schema, description: (String(source.description || name) + '\n\nTarget machine: set target_device to one of ' + aliases.join(', ') + '. If omitted, the default device is ' + (defaultRecord?.alias || 'none') + '.').slice(0, 1000) };
    tools.push(tool);
    toolMap.set(name, { kind: 'device', originalName: name, defaultDeviceId: defaultRecord?.id || null });
  }
  const aliasesMap = [
    ['get_configuration', 'get_config'],
    ['set_configuration_value', 'set_config_value']
  ];
  for (const [alias, originalName] of aliasesMap) {
    const source = unique.get(originalName);
    if (!source || toolMap.has(alias)) continue;
    const schema = JSON.parse(JSON.stringify(source.inputSchema || { type: 'object', properties: {} }));
    if (schema.type !== 'object') { schema.type = 'object'; schema.properties = {}; }
    schema.properties = schema.properties || {};
    schema.properties.target_device = {
      type: 'string', enum: aliases,
      description: 'Choose the machine by alias. Available: ' + descriptions + '. Defaults to ' + (defaultRecord?.alias || 'none') + '.'
    };
    tools.push({ ...source, name: alias, inputSchema: schema, description: ('Compatibility alias for ' + originalName + '. ' + String(source.description || '') + '\n\nChoose target_device from: ' + aliases.join(', ') + '. Defaults to ' + (defaultRecord?.alias || 'none') + '.').slice(0, 1000) });
    toolMap.set(alias, { kind: 'device', originalName, defaultDeviceId: defaultRecord?.id || null });
  }
  for (const t of managerTools) {
    tools.push(t);
    toolMap.set(t.name, { kind: 'manager', originalName: t.name });
  }
};
const recordActivity = (deviceId, toolName, status, durationMs, error = '') => {
  const record = db.devices[deviceId];
  const device = String(deviceId === 'service' ? 'self-host' : (record?.alias || deviceId || 'unknown')).slice(0, 80);
  const tool = String(toolName || 'unknown').slice(0, 120);
  const entry = { at: new Date().toISOString(), tool, device, status, durationMs: Math.max(0, Math.round(durationMs || 0)) };
  if (error) entry.error = String(error).slice(0, 180);
  db.activity.unshift(entry);
  if (db.activity.length > 500) db.activity.length = 500;
  db.usage.totalCalls = (Number(db.usage.totalCalls) || 0) + 1;
  db.usage.byDevice[device] = (Number(db.usage.byDevice[device]) || 0) + 1;
  db.usage.byTool[tool] = (Number(db.usage.byTool[tool]) || 0) + 1;
  db.usage.lastCallAt = entry.at;
  if (db.usage.totalCalls % 10 === 0) save();
};
const rpc = (deviceId, kind, args = {}, ms = 45000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const toolName = kind === 'call' ? args.name : kind === 'ping' ? 'ping_device' : kind === 'shutdown' ? 'shutdown_device_agent' : kind;
  const ws = devices.get(deviceId)?.ws;
  if (!ws || ws.readyState !== 1) {
    recordActivity(deviceId, toolName, 'error', Date.now() - started, 'Device offline');
    reject(new Error('Device offline')); return;
  }
  const id = randomUUID();
  let recorded = false;
  const finish = (status, error = '') => {
    if (recorded) return;
    recorded = true;
    recordActivity(deviceId, toolName, status, Date.now() - started, error);
  };
  const task = {
    resolve: value => { finish('ok'); resolve(value); },
    reject: error => { finish('error', error?.message || error); reject(error); },
    timer: null, ws
  };
  task.timer = setTimeout(() => { waiting.delete(id); task.reject(new Error('Device response timeout')); }, ms);
  waiting.set(id, task);
  ws.send(JSON.stringify({ kind, id, args }), err => {
    if (err) { clearTimeout(task.timer); waiting.delete(id); task.reject(err); }
  });
});
const auth = requireBearerAuth({ verifier: provider, requiredScopes: ['mcp'], resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resource), expectedResource: resource });
const textResult = value => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const toolError = message => ({ isError: true, content: [{ type: 'text', text: String(message) }] });

const handleMcp = async (req, res) => {
  const server = new Server({ name: 'karis-selfhost-mcp', version: process.env.KARIS_VERSION || '0.3.4-karis.2' }, {
    capabilities: { tools: {} },
    instructions: 'Private self-hosted Desktop Commander MCP. File and terminal tools execute with the OS permissions of the selected device. Use target_device when a user names a machine; otherwise the default device is used. Do not run destructive commands unless the user requests them.'
  });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const route = toolMap.get(request.params.name);
    if (!route) return toolError('Unknown tool. Refresh the MCP tool list and try again.');
    const args = request.params.arguments || {};
    if (route.kind === 'manager') {
      if (route.originalName === 'list_paired_devices') { recordActivity('service', route.originalName, 'ok', 0); return textResult(activeRecords().map(viewDevice)); }
      if (route.originalName === 'get_current_user_info') {
        recordActivity('service', route.originalName, 'ok', 0);
        return textResult({
          service: 'Karis Desktop Commander self-host',
          version: process.env.KARIS_VERSION || '0.3.4-karis.2',
          quota: 'No vendor 10,000-calls/month quota is enforced by this self-host',
          connectedDevices: devices.size,
          pairedDevices: activeRecords().length,
          authorizedMcpClients: Object.keys(db.clients || {}).length,
          totalToolCalls: Number(db.usage.totalCalls) || 0,
          defaultDevice: viewDevice(recordFor(db.defaultDeviceId) || { id: '', alias: '', displayName: 'none', tools: [] })
        });
      }
      if (route.originalName === 'ping_device') {
        const record = recordFor(args.device_id);
        if (!record) return toolError('Device not found. Call list_paired_devices to see valid aliases.');
        try {
          const started = Date.now();
          const response = await rpc(record.id, 'ping', {}, 8000);
          return textResult({ ...viewDevice(record), responsive: true, roundTripMs: Date.now() - started, response });
        } catch (e) { return toolError('Ping failed for ' + record.alias + ': ' + e.message); }
      }
      if (route.originalName === 'shutdown_device_agent') {
        const record = recordFor(args.device_id);
        if (!record) return toolError('Device not found. Call list_paired_devices to see valid aliases.');
        try { const response = await rpc(record.id, 'shutdown', {}, 8000); return record.protected ? textResult({ stopped: true, note: 'Restart VPS tools with sudo systemctl start karis-mcp-agent.service.', response }) : response; }
        catch (e) { return toolError('Shutdown failed for ' + record.alias + ': ' + e.message); }
      }
      if (route.originalName === 'get_recent_tool_activity') {
        recordActivity('service', route.originalName, 'ok', 0);
        const requested = Number(args.limit || 20);
        const limit = Number.isFinite(requested) ? Math.max(1, Math.min(100, Math.floor(requested))) : 20;
        return textResult((db.activity || []).slice(0, limit));
      }
      if (route.originalName === 'get_usage_statistics') {
        recordActivity('service', route.originalName, 'ok', 0);
        return textResult({ quota: 'none', quotaLimit: null, period: 'lifetime', totalToolCalls: Number(db.usage.totalCalls) || 0, byDevice: db.usage.byDevice || {}, byTool: db.usage.byTool || {}, lastCallAt: db.usage.lastCallAt || null });
      }
      if (route.originalName === 'get_prompt_library') {
        recordActivity('service', route.originalName, 'ok', 0);
        return textResult({
          safety: ['Inspect paths and project state before modifying files.', 'Use a device alias through target_device when the user names a machine.', 'Never stop a process by a generic name on a shared VPS.', 'Keep test servers and temporary files scoped to the current project.'],
          workflows: [
            { name: 'Understand a project', steps: ['list_directory', 'read_multiple_files', 'start_search', 'get_file_info'] },
            { name: 'Edit safely', steps: ['read_file', 'edit_block or write_file', 'read_file to verify'] },
            { name: 'Long-running command', steps: ['start_process', 'read_process_output', 'interact_with_process', 'force_terminate only for a confirmed task-owned PID'] },
            { name: 'Multiple devices', steps: ['list_paired_devices', 'choose target_device alias', 'ping_device before important changes'] }
          ]
        });
      }
      if (route.originalName === 'submit_feedback') {
        const message = String(args.message || '').trim().slice(0, 4000);
        if (!message) return toolError('Feedback message is required.');
        const feedbackPath = path.join(path.dirname(dbPath), 'feedback.jsonl');
        const fd = fs.openSync(feedbackPath, 'a', 0o600);
        try { fs.writeSync(fd, JSON.stringify({ at: new Date().toISOString(), message }) + '\n'); } finally { fs.closeSync(fd); }
        try { fs.chmodSync(feedbackPath, 0o600); } catch {}
        recordActivity('service', route.originalName, 'ok', 0);
        return textResult({ saved: true, destination: 'private self-host feedback log', uploaded: false });
      }
      return toolError('Unsupported management tool.');
    }
    const callArgs = { ...args };
    const selector = callArgs.target_device;
    delete callArgs.target_device;
    const record = recordFor(selector || route.defaultDeviceId || db.defaultDeviceId);
    if (!record) return toolError('No paired device is available. Open the dashboard and pair a device first.');
    if (!devices.has(record.id)) return toolError('Device ' + record.alias + ' is offline. Start its agent and retry.');
    if (!Array.isArray(record.tools) || !record.tools.some(t => t.name === route.originalName)) {
      return toolError('Tool ' + route.originalName + ' is not available on device ' + record.alias + '.');
    }
    try { return await rpc(record.id, 'call', { name: route.originalName, arguments: callArgs }, 50000); }
    catch (e) { return toolError(e.message); }
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
  catch (e) { if (!res.headersSent) res.status(500).json({ error: 'Internal MCP server error' }); }
  finally { await server.close().catch(() => {}); }
};

const appDevicePackage = process.env.KARIS_AGENT_PACKAGE_URL ||
  'https://github.com/Karis-tlg/DesktopCommanderMCP/releases/download/selfhost-v0.3.4-karis.2/karis-tlg-desktop-commander-0.3.4-karis.2.tgz';

const appServer = createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });
app.all('/mcp', auth, handleMcp);
app.all('/mcp/:linkKey', (req, res) => {
  if (!equal(req.params.linkKey, linkKey)) { res.status(404).send('Not found'); return; }
  return handleMcp(req, res);
});
app.get('/healthz', (_req, res) => res.json({
  ok: true, agent: devices.size > 0, connectedDevices: devices.size, maxDevices: MAX_DEVICES,
  pairedDevices: activeRecords().length, toolCount: tools.length, transport: 'streamable-http', quota: 'none'
}));

wss.on('connection', ws => {
  let currentId = null;
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
    const record = currentId && db.devices[currentId];
    if (record) record.lastSeen = now();
  });
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (currentId && db.devices[currentId]) db.devices[currentId].lastSeen = now();
    if (msg.kind === 'register' && Array.isArray(msg.tools)) {
      const authInfo = ws.karisAuth;
      let id = authInfo?.id;
      let record = id && db.devices[id];
      if (record?.revokedAt) { ws.close(1008, 'Device revoked'); return; }
      if (!record && authInfo?.legacy) {
        const alias = authInfo.alias;
        record = {
          id, alias, displayName: authInfo.displayName, tokenHash: authInfo.tokenHash,
          createdAt: now(), lastSeen: null, revokedAt: null, tools: [],
          platform: 'unknown', agentVersion: null, protected: !!authInfo.protected, source: 'legacy'
        };
        db.devices[id] = record;
      }
      if (!record || record.revokedAt) { ws.close(1008, 'Unknown or revoked device'); return; }
      if (!Array.isArray(msg.tools) || !msg.tools.length) { ws.close(1008, 'No supported MCP tools'); return; }
      const clean = msg.tools.filter(t => t && typeof t.name === 'string' && /^[\w.-]+$/.test(t.name)).slice(0, 100).map(sanitizeTool);
      if (!clean.length) { ws.close(1008, 'No supported MCP tools'); return; }
      const old = devices.get(id);
      if (old && old.ws !== ws) old.ws.close(1000, 'Device reconnected');
      record.tools = clean;
      record.lastSeen = now();
      record.platform = String(msg.platform || record.platform || 'unknown').slice(0, 40);
      record.agentVersion = String(msg.agentVersion || record.agentVersion || 'unknown').slice(0, 40);
      devices.set(id, { ws, alias: record.alias, displayName: record.displayName, tools: clean });
      currentId = id;
      if (!db.defaultDeviceId || !db.devices[db.defaultDeviceId] || db.devices[db.defaultDeviceId].revokedAt) db.defaultDeviceId = record.protected ? id : (activeRecords().find(d => d.protected)?.id || id);
      save(); rebuildTools();
      console.log('Device connected: ' + record.alias + ' (' + clean.length + ' tools); total ' + devices.size + '/' + MAX_DEVICES);
      return;
    }
    if (msg.kind === 'response') {
      const task = waiting.get(msg.id);
      if (!task || task.ws !== ws) return;
      waiting.delete(msg.id); clearTimeout(task.timer);
      if (msg.error) task.reject(new Error(String(msg.error).slice(0, 300)));
      else task.resolve(msg.result);
    }
  });
  ws.on('close', () => {
    if (currentId && devices.get(currentId)?.ws === ws) { devices.delete(currentId); rebuildTools(); }
    for (const [id, task] of waiting) if (task.ws === ws) {
      clearTimeout(task.timer); task.reject(new Error('Device disconnected')); waiting.delete(id);
    }
  });
  ws.on('error', () => {});
});
appServer.on('upgrade', (req, socket, head) => {
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
  if (new URL(req.url, 'http://localhost').pathname !== '/agent' || !bearer) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
  }
  const hash = digest(bearer);
  const matched = Object.values(db.devices).find(d => d.tokenHash === hash);
  let authInfo = null;
  if (matched) {
    if (matched.revokedAt) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    authInfo = { id: matched.id, legacy: false };
  } else if (equal(bearer, agentKey) && !db.legacyVpsRevoked && !db.devices.vps) {
    authInfo = { id: 'vps', alias: 'vps', displayName: 'VPS', protected: true, legacy: true, tokenHash: hash };
  } else if (equal(bearer, linkKey) && !db.legacyWindowsRevoked && !db.devices['legacy-windows']) {
    authInfo = { id: 'legacy-windows', alias: 'windows', displayName: 'Windows (legacy link)', protected: false, legacy: true, tokenHash: hash };
  }
  if (!authInfo) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
  appServer && wss.handleUpgrade(req, socket, head, client => { client.karisAuth = authInfo; wss.emit('connection', client); });
});

const heartbeat = setInterval(() => {
  for (const [id, live] of devices) {
    if (live.ws.readyState !== 1) continue;
    if (live.ws.isAlive === false) { live.ws.terminate(); continue; }
    live.ws.isAlive = false;
    live.ws.ping();
  }
}, 30000);
heartbeat.unref();

rebuildTools();
registerDashboard({
  app, db, save, adminKey, issuer, devices, onChange: rebuildTools, random, digest, equal,
  maxDevices: MAX_DEVICES, failures, agentPackageUrl: appDevicePackage
});

const sweep=setInterval(()=>{cleanup();for(const [k,v] of pending) if(v.exp<now())pending.delete(k);for(const [k,v] of failures)if(v.exp<now())failures.delete(k);save();},300000);sweep.unref();
appServer.listen(port,bind,()=>console.log('Karis MCP listening on '+bind+':'+port+'; public issuer '+issuer.href+'; no monthly tool quota'));
for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>{clearInterval(sweep);clearInterval(heartbeat);for(const ws of wss.clients)ws.close();appServer.close(()=>process.exit(0));setTimeout(()=>process.exit(1),3000).unref();});
