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
if (!dbPath || !adminFile || !agentFile) throw Error('Missing private KARIS_DB_FILE, KARIS_ADMIN_FILE, KARIS_AGENT_FILE');
const secret = (f) => fs.readFileSync(f,'utf8').trim();
const adminKey = secret(adminFile), agentKey = secret(agentFile);
if (adminKey.length < 32 || agentKey.length < 32) throw Error('Generated secrets must be at least 32 chars');
const random = () => randomBytes(32).toString('base64url');
const digest = s => createHash('sha256').update(s).digest('hex');
const equal = (a,b) => { const x=Buffer.from(digest(a),'hex'), y=Buffer.from(digest(b),'hex'); return timingSafeEqual(x,y); };
const now = () => Math.floor(Date.now()/1000);
let db = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath,'utf8')) : {clients:{},codes:{},access:{},refresh:{}};
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
const app=express();app.disable('x-powered-by');app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");next();});
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
app.get('/healthz',(req,res)=>res.json({ok:true,agent:!!active,transport:'streamable-http',quota:'none'}));
let active=null,tools=[],waiting=new Map();
const rpc = (kind,args={},ms=45000) => new Promise((resolve,reject)=>{
 if(!active||active.readyState!==1){reject(new Error('Device offline'));return;}
 const id=randomUUID(),timer=setTimeout(()=>{waiting.delete(id);reject(new Error('Device response timeout'));},ms);
 waiting.set(id,{resolve,reject,timer});active.send(JSON.stringify({kind,id,args}),err=>{if(err){clearTimeout(timer);waiting.delete(id);reject(err);}});
});
const auth=requireBearerAuth({verifier:provider,requiredScopes:['mcp'],resourceMetadataUrl:getOAuthProtectedResourceMetadataUrl(resource),expectedResource:resource});
app.all('/mcp',auth,async(req,res)=>{
 const server=new Server({name:'karis-selfhost-mcp',version:'0.1.0'},{capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools}));
 server.setRequestHandler(CallToolRequestSchema,async r=>{
  const name=r.params.name;
  if(!tools.some(t=>t.name===name))return {isError:true,content:[{type:'text',text:'Unknown tool'}]};
  try{return await rpc('call',{name,arguments:r.params.arguments||{}},50000)}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}
 });
 const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
 try{await server.connect(transport);await transport.handleRequest(req,res,req.body);}catch(e){if(!res.headersSent)res.status(500).json({error:'Internal MCP server error'});}finally{await server.close().catch(()=>{});}
});
const server=createServer(app),wss=new WebSocketServer({noServer:true,maxPayload:2*1024*1024});
server.on('upgrade',(req,socket,head)=>{
 if(new URL(req.url,'http://localhost').pathname!=='/agent'||!req.headers.authorization?.startsWith('Bearer ')||!equal(req.headers.authorization.slice(7),agentKey)){socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');socket.destroy();return;}
 wss.handleUpgrade(req,socket,head,s=>wss.emit('connection',s));
});
wss.on('connection',ws=>{
 if(active)active.close(1000,'Replaced by new agent');active=ws;tools=[];
 ws.on('message',raw=>{let msg;try{msg=JSON.parse(raw.toString())}catch{return;}
   if(msg.kind==='tools'&&Array.isArray(msg.tools)){tools=msg.tools.filter(t=>t&&typeof t.name==='string'&&/^[\w.-]+$/.test(t.name)).slice(0,100);return;}
   if(msg.kind==='response'){const task=waiting.get(msg.id);if(!task)return;waiting.delete(msg.id);clearTimeout(task.timer);if(msg.error)task.reject(new Error(String(msg.error).slice(0,300)));else task.resolve(msg.result);}
 });
 ws.on('close',()=>{if(active===ws){active=null;tools=[];for(const [id,t]of waiting){clearTimeout(t.timer);t.reject(new Error('Device disconnected'));waiting.delete(id);}}});
});
const sweep=setInterval(()=>{cleanup();for(const [k,v] of pending) if(v.exp<now())pending.delete(k);for(const [k,v] of failures)if(v.exp<now())failures.delete(k);save();},300000);sweep.unref();
server.listen(port,bind,()=>console.log(`Karis MCP listening on ${bind}:${port}; public issuer ${issuer.href}; no monthly tool quota`));
for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>{clearInterval(sweep);for(const ws of wss.clients)ws.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),3000).unref();});
