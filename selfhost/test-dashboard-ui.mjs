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
const additionalDevices=process.env.KARIS_UI_STRESS === '1' ? 250 : 65;
const activityEntries=process.env.KARIS_UI_STRESS === '1' ? 498 : 58;
const simulatedDevices=Object.fromEntries(Array.from({length:additionalDevices},(_,i)=>{
  const id='mock-'+String(i+1).padStart(3,'0');
  return [id,{id,alias:id,displayName:'Test Desktop '+String(i+1).padStart(3,'0'),tokenHash:digest(secret()),platform:i%3===0?'win32':i%3===1?'linux':'darwin',tools:[],createdAt:now-3600,lastSeen:now-300,protected:false,agentVersion:'test'}];
}));
const tools=Array.from({length:25},(_,i)=>({name:'tool_'+i,description:'Local device tool',inputSchema:{type:'object',properties:{}}}));
fs.writeFileSync(path.join(dir,'db.json'), JSON.stringify({
  clients: {'demo':{client_id:'demo-client-just-for-ui',client_name:'ChatGPT Connector'}},
  codes:{},access:{},refresh:{},
  devices:{
    vps:{id:'vps',alias:'vps',displayName:'VPS Production',tokenHash:digest(vpsToken),platform:'linux',tools,createdAt:now-86400,lastSeen:now,protected:true,agentVersion:'preview'},
    'pc-one':{id:'pc-one',alias:'kha_pc',displayName:'Windows Workstation',tokenHash:digest(pcToken),platform:'win32',tools,createdAt:now-3600,lastSeen:now,protected:false,agentVersion:'preview'},
    'mac-one':{id:'mac-one',alias:'macbook',displayName:'MacBook cá nhân',tokenHash:digest(secret()),platform:'darwin',tools:[],createdAt:now-5400,lastSeen:now-1200,protected:false,agentVersion:'preview'},
    ...simulatedDevices
  },
  defaultDeviceId:'vps',
  usage:{totalCalls:1284,byDevice:{},byTool:{},lastCallAt:now},
  activity:Array.from({length:activityEntries},(_,i)=>({tool:'history_'+String(i+1),device:i%2?'vps':'kha_pc',status:i%7?'ok':'error',durationMs:20+i,at:new Date().toISOString()}))
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
    const isPc=token===pcToken;
    ws.send(JSON.stringify({kind:'register',platform:isPc?'win32':'linux',agentVersion:'preview',tools,
      startup:isPc ? {supported:true,configured:true,enabled:false,mode:'login',managed:false}
                  : {supported:true,configured:true,enabled:true,mode:'system',managed:true}}));
    if(isPc){
      let enabled=false;
      ws.on('message',raw=>{
        let data;try{data=JSON.parse(String(raw))}catch{return;}
        if(data.kind!=='startup'||!data.id)return;
        if(data.args?.action==='enable')enabled=true;
        else if(data.args?.action==='disable')enabled=false;
        const result={supported:true,configured:true,enabled,mode:'login',managed:false};
        ws.send(JSON.stringify({kind:'response',id:data.id,result}));
      });
    }
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
  assert.equal(desktop.visibleDevices,4);
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-live-region="metrics"] .metric').length),3,'overview should show three useful metrics');
  assert((await page.$eval('[data-live-region="mcp-status"]', e=>e.textContent)).includes('2 thiết bị sẵn sàng'),'MCP panel should show actual ready devices');
  assert(desktop.theme.startsWith('rgb(11, 16, 23)'),'not dark mode: '+desktop.theme);
  assert(desktop.scripts.length===1 && desktop.scripts[0].endsWith('/dashboard/ui.js'),'must use same-origin script');
  assert(desktop.forms,'CSRF missing');
  // On Overview, "Quản lý" is a per-device dropdown, not the full device dialog.
  assert.equal(await page.evaluate(() => {
    const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);
    return ids.length === new Set(ids).size;
  }),true,'each quick/full dropdown and copy-field ID must be unique');
  await page.click('[data-live-region="preview-devices"] [data-device-id="vps"] .manage-button');
  assert(await page.evaluate(()=>document.querySelector('#device-menu-quick-vps')?.matches(':popover-open')),'Overview Manage must open a quick dropdown');
  assert(!(await page.evaluate(()=>document.querySelector('#devices-dialog')?.open)),'Overview Manage must not open the full devices window');
  assert.equal(await page.$eval('#device-menu-quick-vps',el=>el.querySelectorAll('.dropdown-alias').length),0,'duplicate small device name must be removed');
  assert.equal(await page.$eval('#device-menu-quick-vps .device-dropdown-title',el=>el.textContent),'VPS Production','retain one readable device name');
  await page.click('#device-menu-quick-vps .dropdown-startup summary');
  assert((await page.$eval('#device-menu-quick-vps .dropdown-startup',el=>el.textContent)).includes('Đã bật tự khởi động qua systemd'),'VPS startup should be read-only systemd service');
  assert.equal((await page.$$('#device-menu-quick-vps .dropdown-startup button')).length,0,'cannot disable protected systemd service from dashboard');
  assert.equal(await page.$eval('[data-live-region="preview-devices"] [data-device-id="vps"] .manage-button',el=>el.getAttribute('aria-expanded')),'true');
  await page.click('#device-menu-quick-vps .dropdown-disclosure summary');
  await page.waitForFunction(()=>{
    const el=document.querySelector('#device-menu-quick-vps');
    const r=el.getBoundingClientRect();
    return r.left>=0 && r.right<=innerWidth+2 && r.top>=0 && r.bottom<=innerHeight+2;
  },{timeout:3000});
  assert((await page.$eval('#device-menu-quick-vps input[readonly]',el=>el.value)).endsWith('/mcp'),'quick dropdown should show endpoint');
  await page.screenshot({path:path.join(artifacts,'karis-dashboard-overview-quick-dropdown.png')});
  await page.keyboard.press('Escape');
  assert(!(await page.evaluate(()=>document.querySelector('#device-menu-quick-vps').matches(':popover-open'))),'Escape must close quick dropdown');
  await page.waitForFunction(()=>document.querySelector('[data-live-region="preview-devices"] [data-device-id="vps"] .manage-button')?.getAttribute('aria-expanded')==='false',{timeout:2000});
  // Startup settings are real server-mediated agent RPCs, not a cosmetic toggle.
  await page.click('.devices-panel .panel-actions [data-open-dialog="devices-dialog"]');
  await page.click('#devices-dialog [data-device-id="pc-one"] .device-options-trigger');
  await page.click('#device-menu-pc-one .dropdown-startup summary');
  assert((await page.$eval('#device-menu-pc-one .dropdown-startup .startup-status',el=>el.textContent)).includes('Đang tắt'),'PC must begin disabled');
  const csrf=await page.$eval('#devices-dialog [data-device-id="pc-one"] .dropdown-startup [name="_csrf"]',el=>el.value);
  const toggle=async action=>page.evaluate(async args=>{
    const response=await fetch('/dashboard/devices/pc-one/startup',{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({_csrf:args.csrf,action:args.action})});
    return {status:response.status,html:await response.text()};
  },{csrf,action});
  const enabledResponse=await toggle('enable');
  assert.equal(enabledResponse.status,200);
  assert(enabledResponse.html.includes('Đang bật'),'server must render acknowledged enabled status');
  const disabledResponse=await toggle('disable');
  assert.equal(disabledResponse.status,200);
  assert(disabledResponse.html.includes('Đang tắt'),'server must render acknowledged disabled status');
  const invalidResponse=await toggle('invalid');
  assert.equal(invalidResponse.status,400,'arbitrary startup action must be rejected');
  const protectedResponse=await page.evaluate(async token=>{
    const r=await fetch('/dashboard/devices/vps/startup',{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({_csrf:token,action:'disable'})});
    return {status:r.status,body:await r.text()};
  },csrf);
  assert(protectedResponse.body.includes('do hệ thống quản lý'),'protected VPS service must remain unchanged');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // Search still indexes alias without rendering its duplicate as visible text.
  await page.click('.add-trigger');
  assert(await page.evaluate(()=>document.querySelector('#add-device-dialog')?.open),'add-device must open modal');
  assert(await page.$('#add-device-dialog input[name="displayName"]'),'new device field missing');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'device-name','add-device should focus the device name input');
  await page.keyboard.press('Escape');
  assert(!(await page.evaluate(()=>document.querySelector('#add-device-dialog')?.open)),'escape must close modal');

  await page.click('.devices-panel .panel-actions [data-open-dialog="devices-dialog"]');
  assert(await page.evaluate(()=>document.querySelector('#devices-dialog')?.open),'manage must open the device modal');
  assert.equal(await page.$('#inline-device-manager'),null,'no inline manager may be rendered');
  assert.equal((await page['$$']('#devices-dialog .device-tile')).length,3+additionalDevices);
  await page.type('#device-filter','Test Desktop 064');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('#devices-dialog .device-tile:not([hidden])').length),1,'search must filter devices');
  assert((await page.$eval('#device-filter-count',e=>e.textContent)).startsWith('1 / '),'search count must update');
  await page.click('#device-filter');
  await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.press('Backspace');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('#devices-dialog .device-tile:not([hidden])').length),3+additionalDevices,'clearing search restores all devices');
  await page.type('#device-filter','macbook');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('#devices-dialog .device-tile:not([hidden])').length),1,'search should still index hidden alias');
  await page.click('#device-filter');
  await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.press('Backspace');
  const getHeights=()=>page.evaluate(()=>[...document.querySelectorAll('#devices-dialog .device-tile')].slice(0,3).map(row=>row.getBoundingClientRect().height));
  const heightsBefore=await getHeights();
  await page.click('#devices-dialog [data-device-id="mac-one"] .device-options-trigger');
  assert(await page.evaluate(()=>document.querySelector('#device-menu-mac-one')?.matches(':popover-open')),'options should be a dropdown inside the modal');
  assert(await page.evaluate(()=>document.querySelector('#devices-dialog')?.open),'opening options must not dismiss manager modal');
  assert.deepEqual(await getHeights(),heightsBefore,'dropdown must not stretch device rows');
  assert.equal(await page.$('#device-actions-dialog'),null,'no separate options modal should exist');
  const dropdownBounds=await page.$eval('#device-menu-mac-one',el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}});
  assert(dropdownBounds.left>=0&&dropdownBounds.right<=1440,'dropdown must stay in viewport');
  await page.click('#device-menu-mac-one .dropdown-disclosure summary');
  assert((await page.$eval('#device-menu-mac-one input[readonly]',e=>e.value)).endsWith('/mcp'),'MCP endpoint available inside dropdown');
  assert((await page.$eval('#device-menu-mac-one .dropdown-command',e=>e.textContent)).includes('<LINK_GHEP_NOI>'),'lost secret must not be invented');
  await page.screenshot({path:path.join(artifacts,'karis-dashboard-device-dropdown.png')});
  await page.keyboard.press('Escape');
  assert(!await page.evaluate(()=>document.querySelector('#device-menu-mac-one').matches(':popover-open')),'Escape must close dropdown');
  assert(await page.evaluate(()=>document.querySelector('#devices-dialog')?.open),'Escape on dropdown must not dismiss parent modal');
  await page.keyboard.press('Escape');
  assert(!await page.evaluate(()=>document.querySelector('#devices-dialog')?.open),'second Escape must close manager modal');
  await page.click('.devices-panel .panel-actions [data-open-dialog="devices-dialog"]');
  assert(await page.evaluate(()=>document.querySelector('#devices-dialog')?.open),'see-all must reopen device modal');
  await page.keyboard.press('Escape');

  await page.screenshot({path:path.join(artifacts,'karis-dashboard-desktop.png'),fullPage:true});
  await page.goto(root+'/dashboard?view=activity&page=2',{waitUntil:'domcontentloaded'});
  assert.equal((await page['$$']('[data-live-region="activity-list"] .activity-row')).length,20);
  assert((await page.$eval('[data-live-region="activity-list"]',e=>e.textContent)).includes('history_21'),'second page mismatch');
  assert((await page.$eval('[data-live-region="activity-pagination"]',e=>e.textContent)).includes('21–40'),'pagination range mismatch');
  await page.click('a[rel="next"]');
  assert.equal(new URL(page.url()).searchParams.get('page'),'3');
  assert.equal((await page['$$']('[data-live-region="activity-list"] .activity-row')).length,Math.min(20,Math.min(500,activityEntries+2)-40));
  await page.goto(root+'/dashboard?view=activity&page=9999',{waitUntil:'domcontentloaded'});
  assert.equal((await page['$$']('[data-live-region="activity-list"] .activity-row')).length,((Math.min(500,activityEntries+2))%20)||20,'large activity page should clamp');
  await page.goto(root+'/dashboard?view=activity&page=-2',{waitUntil:'domcontentloaded'});
  assert.equal((await page['$$']('[data-live-region="activity-list"] .activity-row')).length,20,'invalid activity page should reset');
  const noConfirm=await page.evaluate(async()=> {
    const token=document.querySelector('[name="_csrf"]')?.value;
    const response=await fetch('/dashboard/devices/mock-001/rotate',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:token})});
    return response.status;
  });
  assert.equal(noConfirm,400,'device key rotation must demand explicit confirmation');

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
  await page.click('.devices-panel .panel-actions [data-open-dialog="devices-dialog"]');
  await page.click('#devices-dialog [data-device-id="pc-one"] .device-options-trigger');
  assert(await page.evaluate(()=>document.querySelector('#device-menu-pc-one')?.matches(':popover-open')),'dropdown should be open before SSE disconnect');
  sockets[1].close(1000,'realtime UI verification');
  await page.waitForFunction(()=>[...document.querySelectorAll('#devices-dialog .device-tile')].some(row=>row.textContent.includes('Windows Workstation') && row.querySelector('.status-badge')?.textContent.includes('Ngoại tuyến')),{timeout:15000});
  await page.click('#device-menu-pc-one .dropdown-startup summary');
  assert.equal((await page.$$('#device-menu-pc-one .dropdown-startup button')).length,0,'offline agent must not offer a startup toggle');
  assert(await page.evaluate(()=>document.querySelector('#device-menu-pc-one')?.matches(':popover-open')),'SSE must preserve open dropdown');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
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
  await page.evaluate(()=>{
    const button=document.querySelector('[data-live-region="preview-devices"] [data-device-id="vps"] .manage-button');
    if (!button) throw new Error('mobile Manage button missing');
    const bounds=button.getBoundingClientRect();
    if (!bounds.width || !bounds.height) throw new Error('mobile Manage button has no dimensions');
    button.click(); // Avoid an SSE DOM replacement invalidating Puppeteer's element handle on stress runs.
  });
  assert(await page.evaluate(()=>document.querySelector('#device-menu-quick-vps')?.matches(':popover-open')),'mobile Overview Manage dropdown must open');
  await page.click('#device-menu-quick-vps .dropdown-disclosure summary');
  await page.waitForFunction(()=>{
    const r=document.querySelector('#device-menu-quick-vps').getBoundingClientRect();
    return r.left>=0 && r.right<=innerWidth+2 && r.top>=0 && r.bottom<=innerHeight+2;
  },{timeout:3000});
  await page.screenshot({path:path.join(artifacts,'karis-dashboard-overview-quick-mobile.png')});
  await page.keyboard.press('Escape');
  await page.click('.devices-panel .panel-actions [data-open-dialog="devices-dialog"]');
  await page.click('#devices-dialog [data-device-id="mac-one"] .device-options-trigger');
  const mobileDropdown=await page.$eval('#device-menu-mac-one',el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:el.scrollWidth,client:el.clientWidth}});
  assert(mobileDropdown.left>=0 && mobileDropdown.right<=390 && mobileDropdown.width<=mobileDropdown.client+2,'mobile dropdown overflow: '+JSON.stringify(mobileDropdown));
  assert(await page.evaluate(()=>document.querySelector('#devices-dialog')?.open),'mobile manager modal still open');
  await page.screenshot({path:path.join(artifacts,'karis-dashboard-dropdown-mobile.png')});
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.click('.add-trigger');
  const mobileDialog=await page.$eval('#add-device-dialog',el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}));
  assert(mobileDialog.left>=0 && mobileDialog.right<=390 && mobileDialog.scrollWidth<=mobileDialog.clientWidth+2,'mobile add-device dialog overflow: '+JSON.stringify(mobileDialog));
  await page.screenshot({path:path.join(artifacts,'karis-dashboard-add-modal.png')});
  await page.type('#device-name','Laptop thử nghiệm');
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.click('#add-device-dialog .pair-form button[type="submit"]')]);
  assert(await page.evaluate(()=>document.querySelector('#pair-result-dialog')?.open),'new device pairing must auto-open one-time result modal');
  assert((await page.$eval('#pair-result-dialog',e=>e.textContent)).includes('/pair/'),'pairing dialog must contain generated URL');
  assert((await page.$eval('#pair-result-dialog',e=>e.textContent)).includes('desktop-commander remote'),'pairing dialog must contain actual install command');
  const issuedCommand=await page.$eval('#pair-command',e=>e.value);
  await page.keyboard.press('Escape');
  await page.reload({waitUntil:'domcontentloaded'});
  assert(await page.evaluate(()=>document.querySelector('#pair-result-dialog')?.open),'pair command must be reopenable during authenticated session');
  assert.equal(await page.$eval('#pair-command',e=>e.value),issuedCommand,'pair token changed during reload');
  await page.keyboard.press('Escape');
  await page.goto(root+'/dashboard?view=overview',{waitUntil:'domcontentloaded'});
  assert(!(await page.content()).includes(issuedCommand),'device secret should not be in normal dashboard markup');
  await page.click('.devices-panel .panel-actions [data-open-dialog="devices-dialog"]');
  const link=await page.$('#devices-dialog .pair-view');
  assert(link,'newly issued pairing link should have re-open control');
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),link.click()]);
  assert.equal(await page.$eval('#pair-command',e=>e.value),issuedCommand,'reopened command must be unchanged');
  const confirmedRotate=await page.evaluate(async()=>{
    const csrf=document.querySelector('[name="_csrf"]')?.value;
    const response=await fetch('/dashboard/devices/mock-001/rotate',{
      method:'POST',credentials:'same-origin',redirect:'follow',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({_csrf:csrf,confirm:'rotate'})
    });
    return {status:response.status,location:response.url};
  });
  assert.equal(confirmedRotate.status,200,'confirmed key rotation should reach the updated dashboard');
  assert(confirmedRotate.location?.includes('&pair='),'rotation should reveal new pairing instructions');
  await page.goto(new URL(confirmedRotate.location,root).href,{waitUntil:'domcontentloaded'});
  assert(await page.evaluate(()=>document.querySelector('#pair-result-dialog')?.open),'new key must be displayed after confirmed rotation');
  assert((await page.$eval('#pair-link',el=>el.value)).includes('/pair/'),'new pairing link must be available');
  assert.equal(errors.length,0,'browser errors: '+errors.join(';'));
  console.log('PASS: '+(3+additionalDevices)+' devices, '+activityEntries+' paged activities, safe pairing and key rotation, readable dialogs, live status, CSP/CSRF, SSE and responsive UI');
  console.log(JSON.stringify({desktop,mobile,screenshots:['karis-dashboard-login.png','karis-dashboard-desktop.png','karis-dashboard-mobile.png']}));

} finally {
  if(browser) await browser.close().catch(()=>{});
  for(const ws of sockets)try{ws.close(1000,'preview cleanup')}catch{}
  if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(3000)]);if(child.exitCode===null)child.kill('SIGKILL')}
  fs.rmSync(dir,{recursive:true,force:true});
}