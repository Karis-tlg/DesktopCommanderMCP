import { WebSocket } from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createInterface } from 'node:readline/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { controllerTools, callController } from './controllers.mjs';
import { readStartup, setStartup } from './startup.mjs';

const args=process.argv.slice(2);
const flag = name => {const ix=args.indexOf(name);return ix>=0?args[ix+1]:undefined};
const configDir=process.env.KARIS_AGENT_CONFIG_DIR||path.join(os.homedir(),'.karis-desktop-commander-agent');
const configFile=path.join(configDir,'config.json');
const conf=fs.existsSync(configFile)?JSON.parse(fs.readFileSync(configFile,'utf8')):{};
let endpoint=flag('--endpoint')||process.env.KARIS_RELAY_URL||conf.endpoint;
let token=flag('--token')||process.env.KARIS_AGENT_TOKEN||conf.token;
let displayName=flag('--name')||process.env.KARIS_AGENT_DEVICE_NAME||conf.name||(process.platform==='win32'?'windows':'device');
const startupContext = () => ({platform:process.platform,configDir,entry:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','index.js'),nodePath:process.execPath,protectedDevice:process.platform==='linux' && !!process.env.KARIS_AGENT_TOKEN});
async function prompt(){
 if(endpoint && (token || /^\/(?:pair|mcp)\/[A-Za-z0-9_-]{40,}$/.test(new URL(endpoint).pathname))) return;
 if(!process.stdin.isTTY)throw Error('Pass --endpoint and --token, or set KARIS_RELAY_URL and KARIS_AGENT_TOKEN');
 const rl=createInterface({input:process.stdin,output:process.stdout});
 try{
  if(!endpoint) endpoint=(await rl.question('Paste your private device pairing URL (https://.../pair/SECRET): ')).trim();
  if(!token && !/^\/(?:pair|mcp)\/[A-Za-z0-9_-]{40,}$/.test(new URL(endpoint).pathname)) token=(await rl.question('Legacy pairing key: ')).trim();
 }finally{rl.close();}
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function runAgent(){
 if(args.includes('--help') || args.includes('-h')) {
  console.log('Karis Desktop Commander self-host remote agent');
  console.log('Usage: desktop-commander remote --endpoint https://host/pair/SECRET [--name windows]');
  console.log('Paste the one-time device pairing URL from the self-host dashboard.');
  console.log('Options: --endpoint URL, --name DEVICE_NAME, --no-save, --help');
  return;
 }
 await prompt();
 const uri=new URL(endpoint);
 if(uri.protocol!=='https:'&&!(uri.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(uri.hostname)))throw Error('Remote endpoint must use HTTPS');
 if(uri.search||uri.hash||uri.username||uri.password)throw Error('Endpoint must not contain query, fragment or credentials');
 const secretMatch=uri.pathname.match(/^\/(?:pair|mcp)\/([A-Za-z0-9_-]{40,})$/);
 if(secretMatch){
  if(!process.env.KARIS_AGENT_TOKEN) token=secretMatch[1];
 } else if(uri.pathname!=='/mcp'&&uri.pathname!=='/agent') throw Error('Endpoint must end with /mcp or /pair/SECRET');
 uri.pathname='/agent';uri.protocol=uri.protocol==='https:'?'wss:':'ws:';
 if(!token||token.length<32)throw Error('Invalid pairing key');
 fs.mkdirSync(configDir,{recursive:true,mode:0o700});
 // Persist device identity even for systemd --no-save service configuration.
 // The pairing credential still remains only in the private environment file.
 const deviceIdFile=path.join(configDir,'device-id');
 const storedId=fs.existsSync(deviceIdFile)?fs.readFileSync(deviceIdFile,'utf8').trim():null;
 const deviceId=conf.deviceId||storedId||randomUUID();
 if(!/^[a-zA-Z0-9_-]{8,80}$/.test(deviceId))throw Error('Invalid saved device identity');
 if(!storedId)fs.writeFileSync(deviceIdFile,deviceId+'\n',{mode:0o600,flag:'wx'});
 displayName=String(displayName).toLowerCase().replace(/[^a-z0-9_-]/g,'_').slice(0,32)||'device';
 if(!args.includes('--no-save')&&!process.env.KARIS_AGENT_TOKEN){
  fs.writeFileSync(configFile,JSON.stringify({endpoint,token,deviceId,name:displayName}),{mode:0o600});
 }
 const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','index.js');
 if(!fs.existsSync(entry))throw Error(`Missing compiled MCP CLI: ${entry}`);
 const childHome=process.env.KARIS_MCP_HOME||path.join(configDir,'runtime-home');fs.mkdirSync(childHome,{recursive:true,mode:0o700});
 const transport=new StdioClientTransport({command:process.execPath,args:[entry,'--no-onboarding'],cwd:process.cwd(),env:{...process.env,HOME:childHome,DESKTOP_COMMANDER_DISABLE_TELEMETRY:'1',KARIS_DISABLE_TOOL_HISTORY:'1'},stderr:'pipe'});
 const client=new Client({name:'karis-private-agent',version:'0.1.0'},{capabilities:{}});
 await client.connect(transport);
 const {tools:baseTools}=await client.listTools();
 const localControllers=controllerTools(process.platform);
 const tools=[...baseTools,...localControllers];
 console.log(`Local MCP ready: ${baseTools.length} base + ${localControllers.length} controller tools`);
 let stopped=false, live=null;
 const end=async()=>{stopped=true;if(live)live.close();await client.close().catch(()=>{});};
 process.once('SIGINT',()=>void end());process.once('SIGTERM',()=>void end());
 let attempt=0;
 while(!stopped){
  try{
   const socket=new WebSocket(uri.href,{headers:{Authorization:`Bearer ${token}`},handshakeTimeout:10000,maxPayload:2*1024*1024});live=socket;
   await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);socket.once('unexpected-response',(_,res)=>reject(new Error(`WS HTTP ${res.statusCode}`)));});
   attempt=0;console.log(`Connected to private relay: ${uri.origin}`);
   socket.send(JSON.stringify({kind:'register',deviceId,name:displayName,tools,platform:process.platform,agentVersion:process.env.KARIS_VERSION||'0.3.4-karis.4',startup:readStartup(startupContext())}));
   await new Promise(resolve=>{
    socket.on('message',async raw=>{let data;try{data=JSON.parse(raw.toString())}catch{return;}
     if(!data.id)return;
     if(data.kind==='ping'){
      if(socket.readyState===1)socket.send(JSON.stringify({kind:'response',id:data.id,result:{content:[{type:'text',text:JSON.stringify({ok:true,name:displayName,platform:process.platform,agentVersion:process.env.KARIS_VERSION||'0.3.4-karis.4',uptimeSeconds:Math.floor(process.uptime())})}]}}));
      return;
     }
     if(data.kind==='shutdown'){
      if(socket.readyState===1)socket.send(JSON.stringify({kind:'response',id:data.id,result:{content:[{type:'text',text:'Device agent is shutting down.'}]}}));
      setTimeout(()=>{void end();},75);
      return;
     }
     if(data.kind==='startup'){
      try{
       const action=data.args?.action;
       const result=action==='status' ? readStartup(startupContext()) : setStartup(action,startupContext());
       if(socket.readyState===1)socket.send(JSON.stringify({kind:'response',id:data.id,result}));
      }catch(e){if(socket.readyState===1)socket.send(JSON.stringify({kind:'response',id:data.id,error:String(e?.message||'Startup configuration failed').slice(0,250)}));}
      return;
     }
     if(data.kind!=='call')return;
     try{
      const name=data.args?.name;
      const result=localControllers.some(t=>t.name===name)
       ? await callController(name,data.args?.arguments||{})
       : await client.callTool({name,arguments:data.args?.arguments||{}},undefined,{timeout:48000});
      if(socket.readyState===1)socket.send(JSON.stringify({kind:'response',id:data.id,result}));
     }
     catch(e){if(socket.readyState===1)socket.send(JSON.stringify({kind:'response',id:data.id,error:e?.message||'Tool failed'}));}
    });
    socket.once('close',resolve);socket.once('error',resolve);
   });
  }catch(e){console.error(`Relay connection error: ${e?.message||e}`);}
  live=null;if(stopped)break;
  await pause(Math.min(30000,Math.round(1200*Math.pow(1.5,Math.min(++attempt,7)))));
 }
 await client.close().catch(()=>{});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) runAgent().catch(e=>{console.error(e.message);process.exitCode=1});
