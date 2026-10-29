import http from 'node:http';
import assert from 'node:assert/strict';
import {callController} from './controllers.mjs';
const PORT=19222;
const toJson=r=>JSON.parse(r.content[0].text);
const page='<html><head><title>Karis Test</title></head><body><input id="note" aria-label="QA input"><button id="save">Save</button><p id="result">waiting</p><script>document.querySelector("#save").addEventListener("click",()=>document.querySelector("#result").textContent=document.querySelector("#note").value);</script></body></html>';
const server=http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(page);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let started=false;
let tabId=null;
try {
 const startedBrowser=toJson(await callController('browser_start',{port:PORT,browser:'edge'}));
 started=true;
 console.log('started browser pid '+startedBrowser.pid);
 const tab=toJson(await callController('browser_new_tab',{port:PORT,url:'http://127.0.0.1:'+server.address().port+'/'})).tab;
 tabId=tab.id;
 let snap;
 for(let n=0;n<30;n++){
   snap=toJson(await callController('browser_snapshot',{port:PORT,tab_id:tabId}));
   if(snap.title==='Karis Test')break;
   await new Promise(r=>setTimeout(r,100));
 }
 assert.equal(snap.title,'Karis Test');
 await callController('browser_fill',{port:PORT,tab_id:tabId,selector:'#note',text:'verified'});
 await callController('browser_click',{port:PORT,tab_id:tabId,selector:'#save'});
 for(let n=0;n<25;n++){
   snap=toJson(await callController('browser_snapshot',{port:PORT,tab_id:tabId}));
   if(snap.text.includes('verified'))break;
   await new Promise(r=>setTimeout(r,100));
 }
 assert.match(snap.text,/verified/);
 const image=await callController('browser_screenshot',{port:PORT,tab_id:tabId});
 assert.equal(image.content[1].type,'image');
 const windows=toJson(await callController('desktop_status',{})).windows;
 const own=windows.find(w=>String(w.title).includes('Karis Test'));
 console.log('Desktop matching window:',own||null);
 assert(own,'Browser smoke test window not visible to Windows UI automation');
 await callController('desktop_focus',{handle:String(own.hwnd)});
 const desktopShot=await callController('desktop_screenshot',{handle:String(own.hwnd)});
 assert.equal(desktopShot.content[1].type,'image');
 const inspected=await callController('desktop_inspect',{handle:String(own.hwnd)});
 assert(inspected.content[0].text.length>0);
 await callController('desktop_set_value',{handle:String(own.hwnd),selector:'QA input',value:'desktop verified'});
 await callController('desktop_invoke',{handle:String(own.hwnd),selector:'Save'});
 let shown;
 for(let n=0;n<20;n++){
   shown=toJson(await callController('browser_snapshot',{port:PORT,tab_id:tabId}));
   if(shown.text.includes('desktop verified'))break;
   await new Promise(r=>setTimeout(r,100));
 }
 assert.match(shown.text,/desktop verified/);
 await callController('browser_key',{port:PORT,tab_id:tabId,key:'Tab'});
 await callController('browser_scroll',{port:PORT,tab_id:tabId,pixels:180});
 const tabs=toJson(await callController('browser_tabs',{port:PORT}));
 assert(tabs.tabs.some(t=>t.id===tabId));
 console.log('PASS: launch, new tab, snapshot, fill, click, screenshot, key, scroll, list');
} finally {
 if(tabId)try{await callController('browser_close_tab',{port:PORT,tab_id:tabId});}catch{}
 if(started){try{console.log(toJson(await callController('browser_stop',{port:PORT})));}catch(e){console.error('Cleanup: '+e.message);}}
 await new Promise(resolve=>server.close(resolve));
}
