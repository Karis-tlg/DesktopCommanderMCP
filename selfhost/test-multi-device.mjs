import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WebSocket } from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const root='http://127.0.0.1:18791';
const secret=fs.readFileSync(process.env.KARIS_TEST_LINK_KEY_FILE||'../runtime/private/link.key','utf8').trim();
const mock=new WebSocket(`${root.replace('http:','ws:')}/agent`,{headers:{Authorization:`Bearer ${secret}`}});
const client=new Client({name:'two-device-smoke',version:'1.0.0'},{capabilities:{}});
let connected=false;
try{
 await new Promise((resolve,reject)=>{mock.once('open',resolve);mock.once('error',reject);});
 mock.send(JSON.stringify({kind:'register',deviceId:'mockwindows0001',name:'windows',tools:[
  {name:'ping',description:'Harmless mock Windows device test',inputSchema:{type:'object',properties:{}},annotations:{readOnlyHint:true}},
  {name:'get_config',description:'Mock Windows configuration',inputSchema:{type:'object',properties:{}},annotations:{readOnlyHint:true}}
 ]}));
 mock.on('message', raw=>{let msg;try{msg=JSON.parse(String(raw))}catch{return;}
  if(msg.kind==='call')mock.send(JSON.stringify({kind:'response',id:msg.id,result:{content:[{type:'text',text:`from mock windows: ${msg.args.name}`}],isError:false}}));
 });
 const transport=new StreamableHTTPClientTransport(new URL(`${root}/mcp/${secret}`));
 await client.connect(transport);connected=true;
 let tools=[];
 for(let i=0;i<20;i++){
  tools=(await client.listTools()).tools;
  if(tools.some(t=>t.name==='windows__ping'))break;
  await new Promise(r=>setTimeout(r,100));
 }
 assert(tools.some(t=>t.name==='windows__ping'),'Windows agent tools missing');
 assert(tools.some(t=>t.name==='vps__get_config'),'VPS scoped tools missing');
 assert(tools.some(t=>t.name==='get_config'),'Legacy VPS aliases missing');
 const win=await client.callTool({name:'windows__ping',arguments:{}});
 assert.match(win.content[0].text,/from mock windows: ping/);
 const legacy=await client.callTool({name:'get_config',arguments:{}});
 assert(!legacy.isError,'VPS tool unavailable after mock Windows agent connected');
 const explicitVps=await client.callTool({name:'vps__get_config',arguments:{}});
 assert(!explicitVps.isError,'VPS scoped route is unavailable');
 const health=await (await fetch(`${root}/healthz`)).json();
 assert.equal(health.connectedDevices,2);
 console.log(`PASS: two active agents, ${tools.length} distinct exposed tools, windows__ping routed to mock, VPS legacy and vps__ routing intact.`);
} finally {if(connected)await client.close().catch(()=>{}); mock.close();}
for(let i=0;i<20;i++){
 const h=await (await fetch(`${root}/healthz`)).json();
 if(h.connectedDevices===1){console.log('PASS: mock agent disconnected cleanly; VPS agent remains online');process.exit(0)}
 await new Promise(r=>setTimeout(r,100));
}
throw Error('Mock agent did not deregister in time');
