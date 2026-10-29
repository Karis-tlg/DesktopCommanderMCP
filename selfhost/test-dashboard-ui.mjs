import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { WebSocket } from 'ws';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = '/home/ubuntu/workspace/temp/desktop-commander-selfhost';
const artifacts = '/home/ubuntu/workspace/projects/desktop-commander-selfhost/artifacts';
fs.mkdirSync(temp,{recursive:true,mode:0o700});
fs.mkdirSync(artifacts,{recursive:true,mode:0o700});
const dir=fs.mkdtempSync(path.join(temp,'dashboard-visual-'));
const secret=()=>randomBytes(36).toString('base64url');
const digest=s=>createHash('sha256').update(s).digest('hex');
const admin=secret(), agent=secret(), link=secret(), vpsToken=secret(), pcToken=secret();
const file=(name,value)=>fs.writeFileSync(path.join(dir,name),value+'\n',{mode:0o600});
file('admin.key',admin);file('agent.key',agent);file('link.key',link);
const now=Math.floor(Date.now()/1000);
const tools=Array.from({length:25},(_,i)=>({name:'tool_'+i,description:'Local device tool',inputSchema:{type:'object',properties:{}}}));
fs.writeFileSync(path.join(dir,'db.json'), JSON.stringify({
  clients: {'demo':{client_id:'demo-client-just-for-ui',client_name:'ChatGPT Connector'}},
  codes:{},access:{},refresh:{},
  devices:{
    vps:{id:'vps',alias:'vps',displayName:'VPS Production',tokenHash:digest(vpsToken),platform:'linux',tools,createdAt:now-86400,lastSeen:now,protected:true,agentVersion:'preview'},
    'pc-one':{id:'pc-one',alias:'kha_pc',displayName:'Windows Workstation',tokenHash:digest(pcToken),platform:'win32',tools,createdAt:now-3600,lastSeen:now,protected:false,agentVersion:'preview'},
    'mac-one':{id:'mac-one',alias:'macbook',displayName:'MacBook cá nhân',tokenHash:digest(secret()),platform:'darwin',tools:[],createdAt:now-5400,lastSeen:now-1200,protected:false,agentVersion:'preview'}
  },
  defaultDeviceId:'vps',
  usage:{totalCalls:1284,byDevice:{},byTool:{},lastCallAt:now},
  activity:[
    {tool:'read_file',device:'vps',status:'ok',durationMs:38,at:new Date().toISOString()},
    {tool:'list_directory',device:'kha_pc',status:'ok',durationMs:59,at:new Date().toISOString()},
    {tool:'get_config',device:'vps',status:'ok',durationMs:14,at:new Date().toISOString()},
    {tool:'start_process',device:'vps',status:'ok',durationMs:174,at:new Date().toISOString()}
  ]
}),{mode:0o600});
const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
const root='http://127.0.0.1:'+port;
const child=spawn(process.execPath,[path.join(project,'selfhost/relay.mjs')],{
  cwd:project,env:{...process.env,KARIS_BIND:'127.0.0.1',KARIS_PORT:String(port),KARIS_PUBLIC_URL:root,
    KARIS_DB_FILE:path.join(dir,'db.json'),KARIS_ADMIN_FILE:path.join(dir,'admin.key'),
    KARIS_AGENT_FILE:path.join(dir,'agent.key'),KARIS_LINK_KEY_FILE:path.join(dir,'link.key'),
    KARIS_AGENT_PACKAGE_URL:'https://example.invalid/preview.tgz'},stdio:['ignore','pipe','pipe']
});
const browserPath='/home/ubuntu/workspace/projects/playwright-vps/browsers/chromium-1243/chrome-linux64/chrome';
let browser=null;const sockets=[];let logs='';
child.stdout.on('data',b=>{logs+=b.toString().slice(0,4000)});
child.stderr.on('data',b=>{logs+=b.toString().slice(0,4000)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try {
  let ready=false;
  for(let i=0;i<90;i++){try{if((await fetch(root+'/healthz')).ok){ready=true;break}}catch{}await sleep(100);}
  assert(ready,'test relay did not start: '+logs);
  for(const token of [vpsToken,pcToken]){
    const ws=new WebSocket(root.replace('http','ws')+'/agent',{headers:{Authorization:'Bearer '+token}});
    await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
    ws.send(JSON.stringify({kind:'register',platform:token===pcToken?'win32':'linux',agentVersion:'preview',tools}));
    sockets.push(ws);
  }
  await sleep(120);
  browser=await puppeteer.launch({executablePath:browserPath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();
  await page.setViewport({width:1440,height:960,deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(root+'/dashboard',{waitUntil:'domcontentloaded'});
  assert((await page.content()).includes('Chào mừng trở lại'),'login must render');
  await page.screenshot({path:path.join(artifacts,'karis-dashboard-login.png'),fullPage:true});
  await page.type('#admin-password',admin);
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.click('.login-form button')]);
  assert((await page.content()).includes('Tổng quan hệ thống'),'dashboard did not render');
  const desktop=await page.evaluate(()=>({title:document.title,bodyWidth:document.body.scrollWidth,viewport:window.innerWidth,devices:document.querySelectorAll('.device-row').length,forms:document.querySelectorAll('form').length,mainText:document.querySelector('h1')?.innerText}));
  assert(desktop.bodyWidth<=desktop.viewport+2,'desktop horizontal overflow: '+JSON.stringify(desktop));
  assert.equal(desktop.devices,3);
  assert((await page.$$('input[name="_csrf"]')).length>=6,'forms must have CSRF');
  await page.screenshot({path:path.join(artifacts,'karis-dashboard-desktop.png'),fullPage:true});
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  await page.reload({waitUntil:'domcontentloaded'});
  const mobile=await page.evaluate(()=>({bodyWidth:document.body.scrollWidth,viewport:window.innerWidth,nav:document.querySelector('.nav').scrollWidth}));
  assert(mobile.bodyWidth<=mobile.viewport+2,'mobile horizontal overflow: '+JSON.stringify(mobile));
  await page.screenshot({path:path.join(artifacts,'karis-dashboard-mobile.png'),fullPage:true});
  assert.equal(errors.length,0,'browser errors: '+errors.join(';'));
  console.log('PASS: visual browser test, login, desktop, 390px mobile, CSRF, 3 devices, no page errors or horizontal overflow.');
  console.log(JSON.stringify({desktop,mobile,screenshots:['karis-dashboard-login.png','karis-dashboard-desktop.png','karis-dashboard-mobile.png']}));
} finally {
  if(browser) await browser.close().catch(()=>{});
  for(const ws of sockets)try{ws.close(1000,'preview cleanup')}catch{}
  if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(3000)]);if(child.exitCode===null)child.kill('SIGKILL')}
  fs.rmSync(dir,{recursive:true,force:true});
}