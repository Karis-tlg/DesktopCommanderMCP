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
  assert((await page.content()).includes('data-view="overview"'),'dashboard did not render');
  await page.waitForFunction(()=>document.querySelector('#live-health')?.textContent.includes('Trực tiếp'),{timeout:10000});
  const desktop=await page.evaluate(()=>({
    width:document.body.scrollWidth,viewport:innerWidth,
    theme:getComputedStyle(document.body).backgroundColor,
    visibleDevices:document.querySelectorAll('[data-live-region="preview-devices"] .device-tile').length,
    scripts:[...document.scripts].map(x=>x.src),forms:[...document.forms].every(x=>!!x.querySelector('[name="_csrf"]'))
  }));
  assert(desktop.width<=desktop.viewport+2,'desktop overflow');
  assert.equal(desktop.visibleDevices,3);
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-live-region="metrics"] .metric').length),3,'overview should show three useful metrics');
  assert((await page.$eval('[data-live-region="mcp-status"]', e=>e.textContent)).includes('2 thiết bị sẵn sàng'),'MCP panel should show actual ready devices');
  assert(desktop.theme.startsWith('rgb(11, 16, 23)'),'not dark mode: '+desktop.theme);
  assert(desktop.scripts.length===1 && desktop.scripts[0].endsWith('/dashboard/ui.js'),'must use same-origin script');
  assert(desktop.forms,'CSRF missing');

  await page.click('.add-trigger');
  assert(await page.evaluate(()=>document.querySelector('#add-device-dialog')?.open),'add-device must open modal');
  assert(await page.$('#add-device-dialog input[name="displayName"]'),'new device field missing');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'device-name','add-device should focus the device name input');
  await page.keyboard.press('Escape');
  assert(!(await page.evaluate(()=>document.querySelector('#add-device-dialog')?.open)),'escape must close modal');

  await page.click('[data-live-region="preview-devices"] [data-open-dialog="devices-dialog"]');
  assert(await page.evaluate(()=>document.querySelector('#devices-dialog')?.open),'quick manage must open full device modal');
  assert.equal((await page.$$('#devices-dialog .device-tile')).length,3);
  await page.keyboard.press('Escape');
  await page.click('.devices-panel .panel-actions [data-open-dialog="devices-dialog"]');
  assert(await page.evaluate(()=>document.querySelector('#devices-dialog')?.open),'see-all must open devices modal');
  await page.keyboard.press('Escape');

  await page.screenshot({path:path.join(artifacts,'karis-dashboard-desktop.png'),fullPage:true});

  for (const route of ['activity','clients','security','overview']) {
    await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.click('[data-page-nav="'+route+'"]')]);
    const state=await page.evaluate(()=>({
      views:[...document.querySelectorAll('[data-view]')].map(x=>x.dataset.view),
      active:document.querySelector('[aria-current="page"]')?.dataset.pageNav,
      urlView:new URL(location.href).searchParams.get('view'),
      width:document.body.scrollWidth,viewport:innerWidth,
      forms:[...document.forms].every(form=>!!form.querySelector('[name="_csrf"]'))
    }));
    assert.deepEqual(state.views,[route]);
    assert.equal(state.active,route);
    assert.equal(state.urlView,route);
    assert(state.forms && state.width<=state.viewport+2,'invalid '+route+' view');
  }
  for (const route of ['devices','connection']) {
    await page.goto(root+'/dashboard?view='+route,{waitUntil:'domcontentloaded'});
    assert((await page.content()).includes('data-view="'+route+'"'),'backward-compatible '+route);
  }
  await page.goto(root+'/dashboard?view=overview',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#live-health')?.textContent.includes('Trực tiếp'),{timeout:10000});
  sockets[1].close(1000,'realtime UI verification');
  await page.waitForFunction(()=>document.querySelector('[data-live-region="metrics"] .metric strong')?.textContent==='1',{timeout:15000});
  assert((await page.$eval('[data-live-region="preview-devices"]',el=>el.textContent)).includes('Ngoại tuyến'),'SSE did not refresh device status');
  assert((await page.$eval('[data-live-region="mcp-status"]',el=>el.textContent)).includes('1 thiết bị sẵn sàng'),'MCP side panel did not update with SSE');
  const unauthScript=await fetch(root+'/dashboard/ui.js');
  const unauthEvents=await fetch(root+'/dashboard/events');
  assert.equal(unauthScript.status,401);
  assert.equal(unauthEvents.status,401);
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  await page.reload({waitUntil:'domcontentloaded'});
  const mobile=await page.evaluate(()=>({width:document.body.scrollWidth,viewport:innerWidth,deviceTiles:document.querySelectorAll('[data-live-region="preview-devices"] .device-tile').length,navVisible:[...document.querySelectorAll('.nav a')].length===4&&[...document.querySelectorAll('.nav a')].every(a=>{const r=a.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})}));
  assert(mobile.width<=mobile.viewport+2,'mobile horizontal overflow: '+JSON.stringify(mobile));
  assert(mobile.navVisible,'all four mobile navigation tabs must be visible');
  await page.screenshot({path:path.join(artifacts,'karis-dashboard-mobile.png'),fullPage:true});
  for (const route of ['activity','clients','security']) {
    await page.goto(root+'/dashboard?view='+route,{waitUntil:'domcontentloaded'});
    const state=await page.evaluate(()=>({width:document.body.scrollWidth,viewport:innerWidth}));
    assert(state.width<=state.viewport+2,'mobile overflow '+route);
  }
  await page.goto(root+'/dashboard?view=overview',{waitUntil:'domcontentloaded'});
  await page.click('.add-trigger');
  await page.type('#device-name','Laptop thử nghiệm');
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.click('#add-device-dialog .pair-form button[type="submit"]')]);
  assert(await page.evaluate(()=>document.querySelector('#pair-result-dialog')?.open),'new device pairing must auto-open one-time result modal');
  assert((await page.$eval('#pair-result-dialog',e=>e.textContent)).includes('/pair/'),'pairing dialog must contain generated URL');
  assert((await page.$eval('#pair-result-dialog',e=>e.textContent)).includes('desktop-commander remote'),'pairing dialog must contain actual install command');
  assert.equal(errors.length,0,'browser errors: '+errors.join(';'));
  console.log('PASS: dark UI, login, 4 tabs, modal add + manage + all devices, CSP, CSRF, SSE device state changes, mobile/desktop, no JS errors/overflow');
  console.log(JSON.stringify({desktop,mobile,screenshots:['karis-dashboard-login.png','karis-dashboard-desktop.png','karis-dashboard-mobile.png']}));

} finally {
  if(browser) await browser.close().catch(()=>{});
  for(const ws of sockets)try{ws.close(1000,'preview cleanup')}catch{}
  if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(3000)]);if(child.exitCode===null)child.kill('SIGKILL')}
  fs.rmSync(dir,{recursive:true,force:true});
}