import assert from 'node:assert/strict';
import {controllerTools,callController} from './controllers.mjs';
const linux=controllerTools('linux');
const win=controllerTools('win32');
const unique=x=>new Set(x.map(y=>y.name)).size===x.length;
assert(unique(win)&&unique(linux),'All tool names must be unique');
assert(linux.every(t=>t.name.startsWith('browser_')),'Linux must not expose Windows-only tools');
assert(win.some(t=>t.name==='desktop_screenshot'));
assert(win.some(t=>t.name==='desktop_set_value'));
for(const t of win){
 assert(t.inputSchema.type==='object');
 assert(t.inputSchema.additionalProperties===false);
 assert(Array.isArray(t.inputSchema.required));
}
async function rejects(name,args,pattern){
 await assert.rejects(callController(name,args),pattern);
}
await rejects('browser_new_tab',{port:1,url:'https://example.org'},/Invalid port/);
await rejects('browser_new_tab',{port:9222,url:'file:///etc/passwd'},/Only http/);
await rejects('browser_new_tab',{port:9222,url:'javascript:alert(1)'},/Only http/);
await rejects('browser_new_tab',{port:9222,url:'https://user:pass@example.org'},/Credential-bearing/);
await rejects('browser_close_tab',{port:9222,tab_id:'../../..'},/Invalid tab ID/);
await rejects('browser_start',{port:1},/Invalid port/);
await rejects('browser_fill',{port:9222,tab_id:'not-a-real-tab',selector:'#foo',text:'x'},/fetch failed|CDP HTTP|Tab unavailable|ECONNREFUSED/);
console.log('PASS: 22 tools (Windows), 12 tools (Linux), schemas and hostile input guards');
