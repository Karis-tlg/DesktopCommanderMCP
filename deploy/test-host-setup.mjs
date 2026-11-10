#!/usr/bin/env node
// Isolated installer lifecycle QA: intentionally NO systemd or production ports.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
const repo=path.resolve(import.meta.dirname,'..');
const base='/home/ubuntu/workspace/temp/desktop-commander-selfhost';
fs.mkdirSync(base,{recursive:true,mode:0o700});
const task=fs.mkdtempSync(path.join(base,'host-qa-'));
const root=path.join(task,'install'),fixture=path.join(task,'source');
const cli=path.join(repo,'deploy','host-cli.mjs');
const subprocesses=[];
let lastPhase='start',cleanupErrors=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const step=(name,args,timeout=240000)=>{
  lastPhase=name;
  const r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout,maxBuffer:1024*1024,
    env:{...process.env,HOME:task}});
  assert.equal(r.status,0, name+' failed: '+String(r.stderr||r.stdout).slice(-1400));
  return r.stdout;
};
const release=()=>fs.realpathSync(path.join(root,'current'));
const readEnv=file=>Object.fromEntries(fs.readFileSync(file,'utf8').trim().split('\n').map(s=>{let n=s.indexOf('=');return [s.slice(0,n),s.slice(n+1)];}));
const portFree=async()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
async function terminate(child){
  if(!child || child.exitCode!==null)return;
  try{process.kill(-child.pid,'SIGINT');}catch{}
  await Promise.race([new Promise(r=>child.once('exit',r)),sleep(2300)]);
  if(child.exitCode===null){try{process.kill(-child.pid,'SIGTERM');}catch{}}
  await Promise.race([new Promise(r=>child.once('exit',r)),sleep(2200)]);
  if(child.exitCode===null){try{process.kill(-child.pid,'SIGKILL');}catch{}}
  await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1200)]);
}
async function stopOwned(){
  for(const proc of subprocesses.reverse())await terminate(proc.child);
  subprocesses.length=0;
}
function spawnOwned(name,file,extraEnv){
  let tail='';
  const child=spawn(process.execPath,[file,...(name==='agent'?['remote','--no-save']:[])],{
    cwd:release(),env:{...process.env,...extraEnv,HOME:path.join(root,'agent-config','test-home')},
    detached:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>tail=(tail+b).slice(-1500));
  child.stderr.on('data',b=>tail=(tail+b).slice(-1500));
  subprocesses.push({child,name,logs:()=>tail});
  return child;
}
async function awaitLive(port,needAgent){
  const until=Date.now()+50000;
  do{
    try{const r=await fetch('http://127.0.0.1:'+port+'/healthz',{signal:AbortSignal.timeout(2500)});
      if(r.ok){const d=await r.json();if(d.ok && (!needAgent || d.connectedDevices===1 && d.toolCount>0))return d;}
    }catch{}
    await sleep(750);
  }while(Date.now()<until);
  throw Error('Relay/agent health timed out. Task logs: '+subprocesses.map(p=>p.name+' '+p.logs()).join('\n'));
}
async function startBoth(port){
  const privateDir=path.join(root,'private');
  spawnOwned('relay',path.join(release(),'selfhost','relay.mjs'),readEnv(path.join(privateDir,'relay.env')));
  await awaitLive(port,false);
  spawnOwned('agent',path.join(release(),'dist','index.js'),readEnv(path.join(privateDir,'agent.env')));
  return awaitLive(port,true);
}
function assertSecretPermissions(){
  for(const f of ['relay.env','agent.env','admin.key','agent.key','link.key']){
    const p=path.join(root,'private',f);
    assert((fs.statSync(p).mode & 0o077)===0,f+' should be owner-only');
  }
}
try{
  const port=await portFree();
  const args=['--root',root,'--port',String(port),'--source',repo,'--no-systemd'];
  const url='http://127.0.0.1:'+port;
  const dry=step('dry-run',['install','--root',root,'--port',String(port),'--url',url,'--source',repo,'--no-systemd','--dry-run'],20000);
  assert.match(dry,/DRY RUN/);assert(!fs.existsSync(root),'dry-run should not create any files');
  const out=step('fresh install',['install','--url',url,...args]);
  assert.match(out,/INSTALL COMPLETE/);assert(!out.includes('Admin password (shown once)'),'secrets must not be logged');
  assertSecretPermissions();
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'installation.json'),'utf8')).managed,false);
  assert(fs.existsSync(path.join(root,'bin','karis')),'test mode wrapper must remain inside test root');
  assert(fs.existsSync(path.join(root,'units','karis-mcp-relay.service')));
  const installed=release();
  const initial=await startBoth(port);
  assert.equal(initial.connectedDevices,1);
  const status=step('status',['status','--root',root],12000);
  assert.match(status,/test mode/);assert.match(status,/Local relay: OK/);
  const doctor=step('doctor',['doctor','--root',root],12000);
  assert.match(doctor,/PASS Local agent online/);
  await stopOwned();
  // Clone a source fixture without caches or Git internals; modify exactly
  // one safe UI asset, to simulate updating within the same package version.
  fs.cpSync(repo,fixture,{recursive:true,filter:p=>!path.relative(repo,p).split(path.sep).some(x=>
    ['node_modules','.git','dist','.npm','.claude','runtime','logs','temp','artifacts','backups'].includes(x))});
  fs.appendFileSync(path.join(fixture,'selfhost','dashboard.css'),'\n/* host-installation QA fixture */\n');
  const updatedArgs=['--root',root,'--source',fixture,'--no-systemd'];
  const updateDry=step('update dry run',['update','--dry-run',...updatedArgs]);
  assert.match(updateDry,/DRY RUN/);
  assert.equal(release(),installed,'dry run changed current release');
  const updateOut=step('update',['update',...updatedArgs]);
  assert.match(updateOut,/UPDATE PASS/);
  const updated=release();
  assert.notEqual(updated,installed,'update did not switch release');
  assert.equal(fs.realpathSync(path.join(root,'previous')),installed);
  const updatedLive=await startBoth(port);
  assert.equal(updatedLive.connectedDevices,1);
  await stopOwned();
  const repeated=step('no-op update',['update',...updatedArgs]);
  assert.match(repeated,/Already up to date/);
  assert.equal(release(),updated);
  const rollbackDry=step('rollback dry-run',['rollback','--dry-run','--root',root,'--no-systemd']);
  assert.match(rollbackDry,/DRY RUN/);
  assert.equal(release(),updated);
  const rollbackOut=step('rollback',['rollback','--root',root,'--no-systemd']);
  assert.match(rollbackOut,/ROLLBACK PASS/);
  assert.equal(release(),installed);
  assert.equal(fs.realpathSync(path.join(root,'previous')),updated);
  const finalLive=await startBoth(port);
  assert.equal(finalLive.connectedDevices,1);
  assertSecretPermissions();
  console.log('PASS: fresh install, no side effects on dry-run, isolated MCP relay+agent, status, doctor, update, no-op update and rollback');
} catch(err){
  console.error('FAIL in '+lastPhase+': '+err.message);
  process.exitCode=1;
} finally{
  await stopOwned();
  // Paths below are generated uniquely by this test; never clean a shared
  // directory or a directory belonging to another task.
  if(task.startsWith(base+'/host-qa-') && fs.existsSync(task)){
    try{fs.rmSync(task,{recursive:true,force:true});}catch(err){cleanupErrors.push(err.message);}
  }
  if(cleanupErrors.length){console.error('Cleanup issues:',cleanupErrors);process.exitCode=1;}
  console.log('QA cleanup '+(fs.existsSync(task)?'INCOMPLETE':'confirmed'));
}
