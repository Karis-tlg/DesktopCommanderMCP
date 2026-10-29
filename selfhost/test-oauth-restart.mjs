import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tempRoot='/home/ubuntu/workspace/temp/desktop-commander-selfhost';
fs.mkdirSync(tempRoot,{recursive:true,mode:0o700});
const dir=fs.mkdtempSync(path.join(tempRoot,'oauth-restart-'));
const random=()=>randomBytes(36).toString('base64url');
const keys={admin:random(),agent:random(),link:random()};
for(const [k,v] of Object.entries(keys))fs.writeFileSync(path.join(dir,k+'.key'),v+'\n',{mode:0o600,flag:'wx'});
const dbFile=path.join(dir,'oauth.json');
const port=await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p))})});
const root='http://127.0.0.1:'+port;
let relay=null, ws=null;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function start(){
  assert(!relay,'must stop prior test relay before launching another');
  const child=spawn(process.execPath,['selfhost/relay.mjs'],{cwd:sourceRoot,env:{...process.env,KARIS_BIND:'127.0.0.1',KARIS_PORT:String(port),KARIS_PUBLIC_URL:root,KARIS_DB_FILE:dbFile,KARIS_ADMIN_FILE:path.join(dir,'admin.key'),KARIS_AGENT_FILE:path.join(dir,'agent.key'),KARIS_LINK_KEY_FILE:path.join(dir,'link.key')},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',d=>{logs+=d.toString().slice(0,400)});child.stderr.on('data',d=>{logs+=d.toString().slice(0,400)});relay=child;
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error('Test relay exited '+logs.slice(-200));try{if((await fetch(root+'/healthz')).ok)return;}catch{}await delay(100)}
  throw Error('Test relay startup timeout '+logs.slice(-200));
}
async function stop(){
  if(!relay)return;let proc=relay;relay=null;
  if(proc.exitCode!==null)return;
  const ended=new Promise(resolve=>proc.once('exit',resolve));
  proc.kill('SIGTERM');await Promise.race([ended,delay(4500).then(()=>{if(proc.exitCode===null)proc.kill('SIGKILL')})]);
}
try {
  await start();
  const reg=await fetch(root+'/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'OAuth restart regression',redirect_uris:['http://127.0.0.1:18799/callback'],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']})});
  assert.equal(reg.status,201);const client=await reg.json();
  const verifier=random(),challenge=createHash('sha256').update(verifier).digest('base64url');
  const auth=new URL(root+'/authorize');
  for(const [k,v] of Object.entries({client_id:client.client_id,redirect_uri:'http://127.0.0.1:18799/callback',response_type:'code',code_challenge:challenge,code_challenge_method:'S256',state:'reboot-test',scope:'mcp',resource:root+'/mcp'}))auth.searchParams.set(k,v);
  const a=await fetch(auth);assert.equal(a.status,200);const id=(await a.text()).match(/name="request" value="([^"]+)"/)?.[1];assert(id);
  assert(fs.readFileSync(dbFile,'utf8').includes('"pendingAuthorizations"'),'pending approvals must persist before restart');
  await stop();
  await start();
  const retry=await fetch(auth);assert.equal(retry.status,200);
  assert.equal((await retry.text()).match(/name="request" value="([^"]+)"/)?.[1],id,'pending approval must survive relay restart unchanged');
  const wrong=await fetch(root+'/approve',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({request:id,password:'incorrect'}),redirect:'manual'});
  assert.equal(wrong.status,403,'incorrect admin password rejected after restart');
  const offline=await fetch(root+'/approve',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({request:id,password:keys.admin}),redirect:'manual'});
  assert.equal(offline.status,503,'correct admin password must not bypass online device validation');
  ws=new WebSocket(root.replace('http','ws')+'/agent',{headers:{Authorization:'Bearer '+keys.agent}});
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
  ws.on('message',buf=>{let msg;try{msg=JSON.parse(buf.toString())}catch{return}if(msg.kind==='ping' && msg.id)ws.send(JSON.stringify({kind:'response',id:msg.id,result:{content:[{type:'text',text:'pong'}]}}))});
  ws.send(JSON.stringify({kind:'register',name:'Test VPS',platform:'linux',agentVersion:'test',tools:[{name:'probe',description:'Test',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}}]}));
  let connected=false;
  for(let i=0;i<40;i++){const h=await (await fetch(root+'/healthz')).json();if(h.connectedDevices>0){connected=true;break}await delay(100)}
  assert(connected,'mock test-only device registered');
  const approve=await fetch(root+'/approve',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({request:id,password:keys.admin}),redirect:'manual'});
  assert.equal(approve.status,302,'retained approval should authorize with valid admin + live device');
  const cb=new URL(approve.headers.get('location'));assert.equal(cb.searchParams.get('state'),'reboot-test');
  const token=await fetch(root+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,code:cb.searchParams.get('code'),code_verifier:verifier,redirect_uri:'http://127.0.0.1:18799/callback',resource:root+'/mcp'})});
  assert.equal(token.status,200,await token.text().then(x=>x.slice(0,160))); // do not log successful token
  const replay=await fetch(root+'/approve',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({request:id,password:keys.admin}),redirect:'manual'});
  assert.equal(replay.status,410,'approval remains one-use');
  assert(!JSON.parse(fs.readFileSync(dbFile,'utf8')).pendingAuthorizations[id],'used approval removed from persistent state');
  console.log('PASS: OAuth request survives relay restart; incorrect password, offline device and replay denied; valid PKCE exchange succeeds.');
} finally {
  if(ws){try{ws.close()}catch{}}
  await stop();
  fs.rmSync(dir,{recursive:true,force:false});
}
