// Desktop controller uses Microsoft's winapp CLI, without native input injection scripts.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const exec=promisify(execFile);
const exe=()=>process.env.KARIS_WINAPP_EXE||path.join(process.env.LOCALAPPDATA||'', 'KarisRemoteCommander','automation-tools','node_modules','@microsoft','winappcli','bin','win-x64','winapp.exe');
const root=()=>path.join(process.env.LOCALAPPDATA||os.tmpdir(),'KarisRemoteCommander','temp','controllers');
const validHandle=value=>{
 const s=String(value||'');
 if(!/^[1-9][0-9]{0,16}$/.test(s))throw Error('A valid window handle from desktop_status is required');
 return s;
};
const safeSelector=s=>{
 if(typeof s!=='string'||!s.trim()||s.length>200)throw Error('Invalid desktop UI element selector');
 return s;
};
function obj(v){return {content:[{type:'text',text:JSON.stringify(v)}]};}
async function cli(args){
 if(!fs.existsSync(exe()))throw Error('Microsoft winapp CLI is not installed in Karis automation-tools');
 const result=await exec(exe(),['ui',...args,'--json'],{
  timeout:16000,windowsHide:true,maxBuffer:2*1024*1024,
  env:{...process.env,WINAPP_CLI_TELEMETRY_OPTOUT:'1'}
 });
 try{return JSON.parse(result.stdout.trim());}
 catch{return {ok:true,output:result.stdout.trim().slice(0,3000)};}
}
function bufferImage(b,data){
 if(b.length>935000)throw Error('Screenshot exceeds relay image limit; reduce target window size');
 return {content:[{type:'text',text:JSON.stringify(data)},{type:'image',data:b.toString('base64'),mimeType:'image/png'}]};
}
async function capture(handle,focus=false){
 fs.mkdirSync(root(),{recursive:true});
 const dest=path.join(root(),'screenshot-'+randomUUID()+'.png');
 try{
  const args=['screenshot','--window',validHandle(handle),'--output',dest];
  if(focus)args.push('--focus');
  const result=await cli(args);
  if(!fs.existsSync(dest))throw Error('Screenshot output missing');
  const image=fs.readFileSync(dest);
  return {result,image};
 }finally{if(fs.existsSync(dest))fs.unlinkSync(dest);}
}
export async function windowsAction(name,args={}){
 if(process.platform!=='win32')throw Error('Desktop controller currently supports Windows only');
 if(name==='desktop_status'){
  const windows=await cli(['list-windows']);
  return obj({windows});
 }
 if(name==='desktop_inspect'){
  return obj(await cli(['inspect','--window',validHandle(args.handle),'--interactive']));
 }
 if(name==='desktop_invoke'){
  return obj(await cli(['invoke',safeSelector(args.selector),'--window',validHandle(args.handle)]));
 }
 if(name==='desktop_set_value'){
  if(typeof args.value!=='string'||args.value.length>10000)throw Error('Invalid value');
  return obj(await cli(['set-value',safeSelector(args.selector),args.value,'--window',validHandle(args.handle)]));
 }
 if(name==='desktop_screenshot'){
  const {image,result}=await capture(args.handle);
  return bufferImage(image,{handle:args.handle,screenshot:result});
 }
 if(name==='desktop_focus'){
  if(args.selector!==undefined)return obj(await cli(['focus',safeSelector(args.selector),'--window',validHandle(args.handle)]));
  const r=await capture(args.handle,true);
  return obj({ok:true,handle:args.handle,screenshotInfo:r.result});
 }
 if(name==='desktop_click'){
  let target;
  if(args.selector!==undefined)target=safeSelector(args.selector);
  else{
   const x=Number(args.x),y=Number(args.y);
   if(!Number.isInteger(x)||!Number.isInteger(y)||Math.abs(x)>32768||Math.abs(y)>32768)throw Error('Coordinates outside safe integer bounds');
   target=x+','+y;
  }
  const opts=['click',target,'--window',validHandle(args.handle)];
  if(args.button==='right')opts.push('--right');
  return obj(await cli(opts));
 }
 if(name==='desktop_type'){
  if(typeof args.text!=='string'||args.text.length>4000)throw Error('Text must have at most 4000 characters');
  return obj(await cli(['send-keys',args.text,'--verbatim','--via','send-input','--window',validHandle(args.handle)]));
 }
 if(name==='desktop_key'){
  if(typeof args.key!=='string')throw Error('Invalid key');
  const lookup={ENTER:'enter',TAB:'tab',ESCAPE:'esc',BACKSPACE:'backspace',DELETE:'delete',SPACE:'space',LEFT:'left',RIGHT:'right',UP:'up',DOWN:'down',HOME:'home',END:'end',PAGEUP:'pageup',PAGEDOWN:'pagedown','CTRL+A':'ctrl+a','CTRL+C':'ctrl+c','CTRL+V':'ctrl+v','CTRL+X':'ctrl+x','CTRL+Z':'ctrl+z','CTRL+S':'ctrl+s'};
  const key=lookup[args.key.toUpperCase()];
  if(!key)throw Error('System keys and unsupported combinations blocked');
  return obj(await cli(['send-keys',key,'--via','send-input','--window',validHandle(args.handle)]));
 }
 if(name==='desktop_scroll'){
  const n=Number(args.ticks);
  if(!Number.isInteger(n)||n===0||Math.abs(n)>12)throw Error('Invalid scroll ticks');
  const opts=['scroll',safeSelector(args.selector),'--wheel',String(n),'--window',validHandle(args.handle)];
  return obj(await cli(opts));
 }
 throw Error('Unknown Windows action '+name);
}
