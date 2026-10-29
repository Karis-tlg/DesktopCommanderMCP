import { WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { windowsAction } from './windows-ui.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const browsers=new Map();
const spec=(name,description,properties={},required=[],readOnly=false)=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations:{title:name,readOnlyHint:readOnly,destructiveHint:!readOnly,openWorldHint:!readOnly}});
const S=description=>({type:'string',description});
const N=(description,min,max)=>({type:'integer',minimum:min,maximum:max,description});
const port=N('Local CDP port, default 9222',1024,65535), tab=S('Tab ID from browser_tabs');
const tp={port,tab_id:tab};
const pt=extra=>({...tp,...extra});
export function controllerTools(platform=process.platform){
 const common=[
  spec('browser_tabs','List tabs of a local Chrome/Edge debugging instance.',{port},[],true),
  spec('browser_start','Launch isolated browser with local CDP profile owned by Karis.',{port,browser:{type:'string',enum:['edge','chrome']}},[]),
  spec('browser_stop','Stop only a browser launched by this agent process.',{port},[]),
  spec('browser_new_tab','Create new browser tab on the local CDP browser.',{port,url:S('http(s) URL or about:blank')},['url']),
  spec('browser_close_tab','Close a browser tab.',tp,['tab_id']),
  spec('browser_navigate','Navigate an existing browser tab.',pt({url:S('http(s) URL or about:blank')}),['tab_id','url']),
  spec('browser_snapshot','Read visible page text and interactive elements.',pt({max_chars:N('Maximum characters',100,16000)}),['tab_id'],true),
  spec('browser_click','Click CSS selector using mouse input.',pt({selector:S('CSS selector'),index:N('Zero-based match index',0,999)}),['tab_id','selector']),
  spec('browser_fill','Fill an editable CSS selector, dispatch input/change events.',pt({selector:S('CSS selector'),text:S('Text (not logged)'),index:N('Zero-based match index',0,999)}),['tab_id','selector','text']),
  spec('browser_key','Press supported key in browser tab.',pt({key:{type:'string',enum:['Enter','Tab','Escape','Backspace','ArrowDown','ArrowUp','ArrowLeft','ArrowRight']}}),['tab_id','key']),
  spec('browser_scroll','Scroll browser tab vertically.',pt({pixels:N('CSS pixels, positive down',-4000,4000)}),['tab_id','pixels']),
  spec('browser_screenshot','Screenshot current browser viewport as JPEG.',tp,['tab_id'],true)
 ];
 if(platform!=='win32')return common;
 return [
  spec('desktop_status','List visible Windows application windows and screen bounds.',{},[],true),
  spec('desktop_inspect','Inspect interactive controls within a Windows window using UI Automation.',{handle:S('Window handle')},['handle'],true),
  spec('desktop_invoke','Invoke an accessible button or control directly via UI Automation.',{handle:S('Window handle'),selector:S('UIA selector')},['handle','selector']),
  spec('desktop_set_value','Set an editable Windows UI element using UI Automation (works without foreground).',{handle:S('Window handle'),selector:S('UIA selector'),value:S('New value')},['handle','selector','value']),
  spec('desktop_screenshot','Capture screenshot of a selected Windows window.',{handle:S('Window handle from desktop_status')},['handle'],true),
  spec('desktop_focus','Focus the selected accessible control (or foreground window for screenshot).',{handle:S('Window handle from desktop_status'),selector:S('Optional UIA selector to focus')},['handle']),
  spec('desktop_click','Click a UIA selector or screen coordinate in a specified window.',{handle:S('Window handle'),selector:S('UI Automation selector (preferred)'),x:N('Screen X',-32768,32768),y:N('Screen Y',-32768,32768),button:{type:'string',enum:['left','right']}},['handle']),
  spec('desktop_type','Type text into an identified Windows window.',{handle:S('Window handle'),text:S('Text to type, max 4000 chars')},['handle','text']),
  spec('desktop_key','Send allowlisted key/combination to identified Windows window.',{handle:S('Window handle'),key:S('Enter, arrows, Ctrl+A etc')},['handle','key']),
  spec('desktop_scroll','Scroll a UI Automation element in selected window.',{handle:S('Window handle'),selector:S('UIA selector from winapp inspect'),ticks:N('Wheel ticks',-12,12)},['handle','selector','ticks']),
  ...common
 ];
}
const text=o=>({content:[{type:'text',text:JSON.stringify(o)}]});
function picture(data,details={}){
 if(typeof data!=='string'||data.length>1250000||!/^[A-Za-z0-9+/=]+$/.test(data))throw Error('Image exceeds secure relay limit; reduce capture dimensions');
 return {content:[{type:'text',text:JSON.stringify(details)},{type:'image',data,mimeType:'image/jpeg'}]};
}
function number(v,min,max,label){const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw Error('Invalid '+label);return n;}
function getPort(a){return a.port===undefined?9222:number(a.port,1024,65535,'port');}
function checkId(v){if(typeof v!=='string'||!/^[-_a-zA-Z0-9]{1,150}$/.test(v))throw Error('Invalid tab ID');return v;}
function checkURL(v){let u;try{u=new URL(v);}catch{throw Error('Invalid URL');}
 if(!['http:','https:'].includes(u.protocol)&&u.href!=='about:blank')throw Error('Only http(s) or about:blank allowed');
 if(u.username||u.password)throw Error('Credential-bearing URLs not allowed');
 return u.href;
}
async function endpoint(port,route,method='GET'){
 const r=await fetch('http://127.0.0.1:'+port+route,{method,signal:AbortSignal.timeout(5000)});
 if(!r.ok)throw Error('CDP HTTP '+r.status);
 return r.json();
}
async function getTab(port,id){
 checkId(id);
 const tabs=await endpoint(port,'/json/list');
 const t=tabs.find(x=>x.id===id&&x.type==='page'&&typeof x.webSocketDebuggerUrl==='string');
 if(!t)throw Error('Tab unavailable: '+id);
 const url=new URL(t.webSocketDebuggerUrl);
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Non-local CDP websocket forbidden');
 return t;
}
async function session(port,id,body){
 const t=await getTab(port,id);
 const socket=new WebSocket(t.webSocketDebuggerUrl,{handshakeTimeout:5000,maxPayload:2097152});
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
 let seq=0;const pending=new Map();
 socket.on('message',raw=>{let m;try{m=JSON.parse(raw.toString());}catch{return;}
  if(!m.id)return;const entry=pending.get(m.id);if(!entry)return;pending.delete(m.id);
  m.error?entry.reject(Error(m.error.message||'CDP error')):entry.resolve(m.result||{});
 });
 const send=(method,params={})=>new Promise((resolve,reject)=>{
  if(socket.readyState!==WebSocket.OPEN){reject(Error('CDP closed'));return;}
  const id=++seq;
  const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},10000);
  pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});
  socket.send(JSON.stringify({id,method,params}),err=>{if(err){const v=pending.get(id);if(v){pending.delete(id);v.reject(err);}}});
 });
 try{return await body(send,t);}
 finally{for(const entry of pending.values())entry.reject(Error('CDP disconnected'));pending.clear();socket.close();}
}
async function evaluate(send,code){
 const r=await send('Runtime.evaluate',{expression:code,returnByValue:true,awaitPromise:true,timeout:9500});
 if(r.exceptionDetails)throw Error('Page action failed: '+(r.exceptionDetails.text||r.result?.description||'JavaScript exception'));
 return r.result?.value;
}
function query(selector,index=0){
 if(typeof selector!=='string'||!selector.trim()||selector.length>512)throw Error('Invalid CSS selector');
 number(index,0,999,'index');
 return 'document.querySelectorAll('+JSON.stringify(selector)+')['+index+']';
}
async function browserAction(name,a){
 const p=getPort(a);
 if(name==='browser_start'){
  if(browsers.has(p))return text({ok:true,alreadyManaged:true,pid:browsers.get(p).pid,port:p});
  try{await endpoint(p,'/json/version');throw Error('CDP port occupied by another browser');}
  catch(e){if(!/fetch failed|ECONNREFUSED|connect|timeout/i.test(String(e.cause?.message||e.message)))throw e;}
  const root=path.resolve(process.env.KARIS_AGENT_CONFIG_DIR||path.join(os.homedir(),'.karis-desktop-commander-agent'),'controlled-browser');
  const profile=path.join(root,'profile-'+p);
  fs.mkdirSync(profile,{recursive:true,mode:0o700});
  const bins=process.platform==='win32' ?
   (a.browser==='chrome' ?
    [path.join(process.env.PROGRAMFILES||'C:\\Program Files','Google','Chrome','Application','chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']||'C:\\Program Files (x86)','Google','Chrome','Application','chrome.exe')] :
    [path.join(process.env['PROGRAMFILES(X86)']||'C:\\Program Files (x86)','Microsoft','Edge','Application','msedge.exe'),path.join(process.env.PROGRAMFILES||'C:\\Program Files','Microsoft','Edge','Application','msedge.exe')]) :
   ['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'];
  const binary=bins.find(f=>fs.existsSync(f));
  if(!binary)throw Error('No supported Chrome/Edge binary installed');
  const child=spawn(binary,['--remote-debugging-address=127.0.0.1','--remote-debugging-port='+p,'--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore',windowsHide:false});
  if(!child.pid)throw Error('Browser did not start');
  browsers.set(p,child);child.once('exit',()=>{if(browsers.get(p)===child)browsers.delete(p);});
  for(let i=0;i<32;i++){
   try{await endpoint(p,'/json/version');return text({ok:true,port:p,pid:child.pid,profile});}
   catch{await new Promise(r=>setTimeout(r,250));}
  }
  if(browsers.get(p)===child){child.kill();browsers.delete(p);}
  throw Error('Managed browser did not expose localhost CDP');
 }
 if(name==='browser_stop'){
  const child=browsers.get(p);if(!child)throw Error('Browser not owned by this agent process');
  child.kill();browsers.delete(p);return text({ok:true,stoppedPid:child.pid});
 }
 if(name==='browser_tabs'){
  const tabs=await endpoint(p,'/json/list');
  return text({port:p,tabs:tabs.filter(t=>t.type==='page').map(t=>({id:t.id,title:String(t.title||'').slice(0,160),url:String(t.url||'').slice(0,300)}))});
 }
 if(name==='browser_new_tab'){
  const t=await endpoint(p,'/json/new?'+encodeURIComponent(checkURL(a.url)),'PUT');
  return text({ok:true,tab:{id:t.id,url:t.url,title:t.title}});
 }
 if(name==='browser_close_tab'){
  await getTab(p,a.tab_id);
  const r=await fetch('http://127.0.0.1:'+p+'/json/close/'+checkId(a.tab_id),{signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw Error('Close tab returned '+r.status);
  return text({ok:true,closed:a.tab_id});
 }
 return session(p,a.tab_id,async(send,t)=>{
  if(name==='browser_navigate'){
   const url=checkURL(a.url);await send('Page.enable');const r=await send('Page.navigate',{url});
   if(r.errorText)throw Error(r.errorText);
   return text({ok:true,navigatedTo:url,tab_id:t.id});
  }
  if(name==='browser_snapshot'){
   const max=a.max_chars===undefined?8000:number(a.max_chars,100,16000,'max_chars');
   const js='(()=>{const visible=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);const controls=Array.from(document.querySelectorAll("a,button,input:not([type=hidden]),textarea,select,[role=button],[contenteditable=true]")).filter(visible).slice(0,80).map((e,i)=>({index:i,tag:e.tagName.toLowerCase(),type:e.type||"",text:(e.innerText||"").slice(0,90),label:(e.getAttribute("aria-label")||e.getAttribute("placeholder")||"").slice(0,120),id:e.id||"",name:e.name||""}));return {title:document.title,url:location.href,readyState:document.readyState,text:(document.body?.innerText||"").slice(0,'+max+'),controls};})()';
   return text(await evaluate(send,js));
  }
  if(name==='browser_click'){
   const i=a.index===undefined?0:a.index;
   const js='(()=>{const e='+query(a.selector,i)+';if(!e)throw Error("Element not found");e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();if(r.width<1||r.height<1)throw Error("Element hidden");return {x:r.left+r.width/2,y:r.top+r.height/2};})()';
   const loc=await evaluate(send,js);
   await send('Input.dispatchMouseEvent',{type:'mousePressed',x:loc.x,y:loc.y,button:'left',clickCount:1});
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:loc.x,y:loc.y,button:'left',clickCount:1});
   return text({ok:true,selector:a.selector,index:i});
  }
  if(name==='browser_fill'){
   if(typeof a.text!=='string'||a.text.length>16000)throw Error('Invalid text length');
   const js='(()=>{const e='+query(a.selector,a.index===undefined?0:a.index)+';if(!e)throw Error("Element not found");e.focus();if(e.isContentEditable){e.textContent='+JSON.stringify(a.text)+';e.dispatchEvent(new Event("input",{bubbles:true}));}else if("value" in e){const proto=e.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;if(setter)setter.call(e,'+JSON.stringify(a.text)+');else e.value='+JSON.stringify(a.text)+';e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));}else throw Error("Not editable");return true;})()';
   await evaluate(send,js);
   return text({ok:true,characters:a.text.length});
  }
  if(name==='browser_scroll'){
   const px=number(a.pixels,-4000,4000,'pixels');
   await evaluate(send,'window.scrollBy(0,'+px+');true');
   return text({ok:true,pixels:px});
  }
  if(name==='browser_key'){
   const vk={Enter:13,Tab:9,Escape:27,Backspace:8,ArrowDown:40,ArrowUp:38,ArrowLeft:37,ArrowRight:39};
   if(!Object.hasOwn(vk,a.key))throw Error('Unsupported key');
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:a.key,windowsVirtualKeyCode:vk[a.key]});
   await send('Input.dispatchKeyEvent',{type:'keyUp',key:a.key,windowsVirtualKeyCode:vk[a.key]});
   return text({ok:true,key:a.key});
  }
  if(name==='browser_screenshot'){
   await send('Page.enable');
   const r=await send('Page.captureScreenshot',{format:'jpeg',quality:45,fromSurface:true,captureBeyondViewport:false});
   return picture(r.data,{tab_id:t.id});
  }
  throw Error('Unknown browser operation');
 });
}
async function desktopAction(name,args){
 return windowsAction(name,args);
}
export async function callController(name,args={}){
 if(name.startsWith('desktop_'))return desktopAction(name,args);
 if(name.startsWith('browser_'))return browserAction(name,args);
 throw Error('Unknown controller operation');
}
