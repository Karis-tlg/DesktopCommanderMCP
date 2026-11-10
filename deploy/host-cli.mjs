#!/usr/bin/env node
// Karis Control host lifecycle. Uses only Node.js built-ins; system changes
// require explicit commands and authorized sudo. Never edits unrelated services.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';

const REPO='https://github.com/Karis-tlg/DesktopCommanderMCP.git';
const UNIT_RELAY='karis-mcp-relay.service', UNIT_AGENT='karis-mcp-agent.service';
const DEFAULT_ROOT=path.join(os.homedir(),'.local','share','karis-control');
const versionAtLeast=(actual,min)=> {
  const a=actual.split('.').map(Number),b=min.split('.').map(Number);
  for(let i=0;i<3;i++){if((a[i]||0)!==(b[i]||0))return (a[i]||0)>(b[i]||0);}
  return true;
};
const say=msg=>process.stdout.write(String(msg)+'\n');
const fail=msg=>{throw Error(msg);};
const run=(bin,args,opts={})=>execFileSync(bin,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:opts.timeout||180000,cwd:opts.cwd,env:opts.env||process.env}).trim();
const has=bin=>spawnSync('bash',['-c','command -v "$1" >/dev/null 2>&1','bash',bin],{encoding:'utf8'}).status===0;
const exists=p=>fs.existsSync(p);
const mkdir=(p,mode=0o700)=>fs.mkdirSync(p,{recursive:true,mode});
const secret=()=>crypto.randomBytes(48).toString('base64url');
const put=(p,s,mode=0o600)=>fs.writeFileSync(p,String(s),{mode,flag:'wx'});
const replace=(p,s,mode=0o600)=>{const tmp=p+'.'+process.pid+'.new';put(tmp,s,mode);fs.renameSync(tmp,p);};
const shortUrl=u=>{const v=new URL(u);if(v.username||v.password||v.search||v.hash||v.pathname!=='/')fail('Public URL must be a bare HTTPS origin.');return v.origin;};
const isLoop=u=>/^http:\/\/(?:127\.0\.0\.1|localhost):[0-9]+$/.test(u);
const quote=s=>"'"+String(s).replaceAll("'","'\\''")+"'";
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const revision=dir=>{
  const files=['package.json','selfhost/relay.mjs','selfhost/dashboard.mjs','selfhost/dashboard-view.mjs','selfhost/dashboard.css','selfhost/agent.mjs','deploy/host-cli.mjs','dist/index.js'];
  const hash=crypto.createHash('sha256');
  for(const file of files){const full=path.join(dir,file);if(exists(full))hash.update(file).update(fs.readFileSync(full));}
  return hash.digest('hex').slice(0,12);
};
const localEnv=(root)=>path.join(root,'private','relay.env');
const readEnv=(file)=>Object.fromEntries(fs.readFileSync(file,'utf8').split('\n').filter(x=>x && !x.startsWith('#')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));
const parse=argv=>{
  const opts={cmd:'help',root:DEFAULT_ROOT,url:'',port:18791,source:'',noSystemd:false,dryRun:false,yes:false,tailscale:false};
  const a=[...argv];if(a.length && !a[0].startsWith('--'))opts.cmd=a.shift();
  while(a.length){const t=a.shift();if(['--root','--url','--port','--source'].includes(t)){if(!a.length)fail('Missing value after '+t);opts[t.slice(2)]=a.shift();}
    else if(t==='--help'||t==='-h')opts.cmd='help';
    else if(t==='--no-systemd')opts.noSystemd=true;
    else if(t==='--tailscale')opts.tailscale=true;
    else if(t==='--dry-run')opts.dryRun=true;
    else if(t==='--yes')opts.yes=true;
    else fail('Unknown argument: '+t);
  }
  opts.root=path.resolve(opts.root);
  if(!/^[a-zA-Z0-9_.\/-]+$/.test(opts.root))fail('Root path must contain only letters, numbers, dot, dash, underscore and slash.');
  opts.port=Number(opts.port);
  if(!Number.isInteger(opts.port)||opts.port<1024||opts.port>65535)fail('Port must be 1024–65535.');
  if(opts.source)opts.source=path.resolve(opts.source);
  return opts;
};
const printHelp=()=>{
  say('Karis Control — self-hosted MCP & dashboard');
  say('Usage: karis <status|doctor|update|rollback> [--yes]');
  say('Install: node deploy/host-cli.mjs install --url https://your-domain [--port 18791]');
  say('Or:      node deploy/host-cli.mjs install --tailscale [--port 18791]');
  say('Options: --root DIR, --dry-run, --yes; advanced test: --source DIR --no-systemd');
};
const serviceInstalled=unit=>{
  const p=spawnSync('systemctl',['cat',unit],{encoding:'utf8',timeout:5000});
  return p.status===0;
};
async function portFree(port){
  return new Promise(resolve=>{
    const server=net.createServer();
    server.once('error',()=>resolve(false));
    server.listen({host:'127.0.0.1',port,exclusive:true},()=>server.close(()=>resolve(true)));
  });
}
function tailscaleName(){
  if(!has('tailscale'))fail('Install and authenticate Tailscale first, or pass --url https://your-domain.');
  const obj=JSON.parse(run('tailscale',['status','--json'],{timeout:12000}));
  const fqdn=String(obj.Self?.DNSName||'').replace(/\.$/,'');
  if(!/^[a-z0-9.-]+\.ts\.net$/.test(fqdn))fail('Tailscale hostname is not available; run tailscale up first.');
  return 'https://'+fqdn;
}
function assertNode(){
  if(!versionAtLeast(process.versions.node,'22.12.0'))fail('Node.js >=22.12 required. Install Node.js LTS first.');
  for(const cmd of ['git','npm'])if(!has(cmd))fail(cmd+' is missing; install git and Node.js/npm first.');
}
function validateNew(opts){
  assertNode();
  if(!opts.noSystemd && process.getuid?.()===0)fail('Run installer as a regular Linux user with sudo available, not root.');
  if(opts.tailscale && opts.url)fail('Use either --tailscale or --url, not both.');
  if(!opts.url&&!opts.tailscale)fail('Pass --tailscale or --url https://your-domain.');
  const url=opts.tailscale ? tailscaleName():shortUrl(opts.url);
  if(!opts.noSystemd && !url.startsWith('https://'))fail('Public production endpoint must use HTTPS.');
  if(opts.noSystemd && !url.startsWith('https://')&&!isLoop(url))fail('Non-HTTPS is allowed only for loopback tests.');
  if(exists(path.join(opts.root,'current')) || exists(path.join(opts.root,'private','relay.env')))
    fail('An installation already exists at '+opts.root+'; use karis update or status.');
  if(!opts.noSystemd){
    if(process.platform!=='linux')fail('Host installer supports Linux with systemd only.');
    if(!has('systemctl')||!has('sudo'))fail('Requires systemd and sudo.');
    if(serviceInstalled(UNIT_RELAY)||serviceInstalled(UNIT_AGENT))
      fail('Existing Karis systemd services detected. Refusing to replace shared/production services.');
  }
  return url;
}
function checkTailscaleAvailable(port){
  if(!has('tailscale'))fail('tailscale CLI missing.');
  // Never overwrite an existing Serve/Funnel configuration on a shared host.
  for(const cmd of ['serve','funnel']){
    const p=spawnSync('tailscale',[cmd,'status','--json'],{encoding:'utf8',timeout:8000});
    if(p.status!==0)continue;
    try {const obj=JSON.parse(p.stdout);if(Object.keys(obj||{}).length>0)fail('Tailscale '+cmd+' already configured; manage its routes manually.');}catch(e){if(e?.message?.includes('already configured'))throw e;}
  }
  if(port===443)fail('Choose an internal port different from HTTPS 443.');
}
function releaseName(dir){
  const p=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));
  if(!/^[0-9A-Za-z.+-]+$/.test(p.version))fail('Invalid package version.');
  return p.version;
}
function stage(root,source){
  const rel=path.join(root,'releases');mkdir(rel);
  const candidate=path.join(rel,'.staging-'+process.pid);
  if(exists(candidate))fail('Staging path already exists; another setup may be running.');
  try{
    if(source){
      if(!exists(path.join(source,'package.json'))||!exists(path.join(source,'selfhost','relay.mjs')))fail('Invalid --source: no Karis server files.');
      fs.cpSync(source,candidate,{recursive:true,errorOnExist:true,force:false,
        filter:p=>!path.relative(source,p).split(path.sep).some(x=>['.git','node_modules','runtime','.npm','.claude','.env','artifacts','logs','temp','backups'].includes(x))});
    }else run('git',['clone','--depth=1','--branch','main','--quiet',REPO,candidate],{timeout:180000});
    // Non-project scripts cannot control build commands; this source is pinned
    // to the owner repository, or explicitly passed by the local administrator.
    run('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:candidate,timeout:240000});
    run('npm',['run','build'],{cwd:candidate,timeout:180000});
    for(const file of ['dist/index.js','selfhost/relay.mjs','selfhost/agent.mjs'])
      if(!exists(path.join(candidate,file)))fail('Built release is missing '+file);
    run(process.execPath,['--check',path.join(candidate,'selfhost/relay.mjs')],{timeout:10000});
    const ref=revision(candidate);
    const dest=path.join(rel,ref);
    if(exists(dest)){
      // An already-built identical release can be re-used on update.
      fs.rmSync(candidate,{recursive:true,force:true});
      return dest;
    }
    fs.renameSync(candidate,dest);
    return dest;
  }catch(e){if(exists(candidate))fs.rmSync(candidate,{recursive:true,force:true});throw e;}
}
function linkAtomic(dest,link){
  const temp=link+'.swap-'+process.pid;
  fs.symlinkSync(dest,temp);
  fs.renameSync(temp,link);
}
function envFiles(root,url,port,release){
  const privateDir=path.join(root,'private');mkdir(privateDir);
  const admin=secret(),agent=secret(),link=secret();
  put(path.join(privateDir,'admin.key'),admin+'\n');
  put(path.join(privateDir,'agent.key'),agent+'\n');
  put(path.join(privateDir,'link.key'),link+'\n');
  const version=releaseName(release);
  const asset='https://github.com/Karis-tlg/DesktopCommanderMCP/releases/download/selfhost-v'+version+'/karis.tgz';
  put(path.join(privateDir,'relay.env'),[
    'KARIS_BIND=127.0.0.1','KARIS_PORT='+port,'KARIS_PUBLIC_URL='+url,
    'KARIS_DB_FILE='+path.join(privateDir,'db.json'),
    'KARIS_ADMIN_FILE='+path.join(privateDir,'admin.key'),
    'KARIS_AGENT_FILE='+path.join(privateDir,'agent.key'),
    'KARIS_LINK_KEY_FILE='+path.join(privateDir,'link.key'),
    'KARIS_AGENT_PACKAGE_URL='+asset,'KARIS_VERSION='+version,
    'KARIS_DISABLE_TOOL_HISTORY=1','KARIS_MAX_DEVICES=8',''
  ].join('\n'));
  put(path.join(privateDir,'agent.env'),[
    'KARIS_AGENT_CONFIG_DIR='+path.join(root,'agent-config'),
    'KARIS_MCP_HOME='+path.join(root,'agent-config','runtime-home'),
    'KARIS_RELAY_URL=http://127.0.0.1:'+port+'/mcp',
    'KARIS_AGENT_TOKEN='+agent,
    'KARIS_AGENT_DEVICE_NAME=vps','KARIS_DISABLE_TOOL_HISTORY=1','KARIS_VERSION='+version,''
  ].join('\n'));
  return admin;
}
function units(root,user,group){
  const current=path.join(root,'current');
  const base=['[Unit]','Description=Karis Control self-hosted MCP relay','After=network-online.target','Wants=network-online.target','[Service]','Type=simple','User='+user,'Group='+group,
    'WorkingDirectory='+current,'EnvironmentFile='+path.join(root,'private','relay.env'),
    'ExecStart='+process.execPath+' '+path.join(current,'selfhost','relay.mjs'),
    'Restart=on-failure','RestartSec=5','NoNewPrivileges=true','PrivateTmp=true','UMask=0077','LimitNOFILE=8192','[Install]','WantedBy=multi-user.target',''].join('\n');
  const agent=['[Unit]','Description=Karis Control local VPS agent','Requires='+UNIT_RELAY,'After='+UNIT_RELAY,
    '[Service]','Type=simple','User='+user,'Group='+group,
    'WorkingDirectory='+current,'EnvironmentFile='+path.join(root,'private','agent.env'),
    'ExecStart='+process.execPath+' '+path.join(current,'dist','index.js')+' remote --no-save',
    'Restart=on-failure','RestartSec=8','NoNewPrivileges=true','PrivateTmp=true','UMask=0077','LimitNOFILE=8192',
    '[Install]','WantedBy=multi-user.target',''].join('\n');
  const dir=path.join(root,'units');mkdir(dir);
  put(path.join(dir,UNIT_RELAY),base,0o600);
  put(path.join(dir,UNIT_AGENT),agent,0o600);
}
function authenticateSudo(){
  const check=spawnSync('sudo',['-v'],{stdio:'inherit',timeout:120000});
  if(check.status!==0)fail('Administrator sudo authorization is required to install/manage systemd services.');
}
function sudo(args){run('sudo',['-n',...args],{timeout:60000});}
function systemctl(...args){sudo(['systemctl',...args]);}
function installSystemd(root){
  for(const unit of [UNIT_RELAY,UNIT_AGENT]){
    if(serviceInstalled(unit))fail('Another process installed '+unit+'; refusing overwrite.');
    sudo(['install','-m','0644',path.join(root,'units',unit),path.join('/etc/systemd/system',unit)]);
  }
  systemctl('daemon-reload');
  systemctl('enable','--now',UNIT_RELAY);
}
function startAgent(){systemctl('enable','--now',UNIT_AGENT);}
async function health(root,wantAgent=false,timeoutMs=40000){
  let env;try{env=readEnv(localEnv(root));}catch{return null;}
  const port=Number(env.KARIS_PORT||18791);
  const end=Date.now()+timeoutMs;
  do{
    try{
      const res=await fetch('http://127.0.0.1:'+port+'/healthz',{signal:AbortSignal.timeout(3000)});
      if(res.ok){const data=await res.json();if(data.ok===true && (!wantAgent||data.connectedDevices>0))return data;}
    }catch{}
    if(Date.now()+800<end)await new Promise(r=>setTimeout(r,800));
  }while(Date.now()<end);
  return null;
}
function wrapper(root,noSystemd){
  const bin=noSystemd ? path.join(root,'bin') : path.join(os.homedir(),'.local','bin');mkdir(bin);
  const target=path.join(bin,'karis');
  if(exists(target) && !fs.readFileSync(target,'utf8').includes('# managed-by: karis-control-host'))
    fail('Existing karis binary is not owned by this installer; leaving it unchanged.');
  const text=['#!/usr/bin/env bash','# managed-by: karis-control-host',
    'exec '+quote(process.execPath)+' '+quote(path.join(root,'current','deploy','host-cli.mjs'))+' "$@"',''].join('\n');
  if(exists(target))fs.rmSync(target);
  put(target,text,0o700);
  return target;
}
function lock(root){
  mkdir(root);
  const name=path.join(root,'.operation.lock');
  try{fs.mkdirSync(name,{mode:0o700});}catch{fail('Another Karis install/update may be in progress at '+name);}
  return ()=>fs.rmdirSync(name);
}
async function install(o){
  const url=validateNew(o);
  if(!(await portFree(o.port)))fail('Port '+o.port+' already in use; pass --port with a free port.');
  if(o.tailscale&&!o.noSystemd)checkTailscaleAvailable(o.port);
  say('Install plan: '+url+' (relay 127.0.0.1:'+o.port+'), path '+o.root);
  say('Steps: download/build, create owner-only keys, generate two systemd services, health check.');
  if(o.dryRun){say('DRY RUN: no files, services or network settings changed.');return;}
  if(!o.yes && !o.noSystemd)fail('Installation changes systemd services. Re-run with --yes after reviewing the plan.');
  if(!o.noSystemd)authenticateSudo();
  const unlock=lock(o.root);
  let rel=null;
  try{
    rel=stage(o.root,o.source);
    const admin=envFiles(o.root,url,o.port,rel);
    mkdir(path.join(o.root,'agent-config'),0o700);
    linkAtomic(rel,path.join(o.root,'current'));
    const user=process.env.SUDO_USER||os.userInfo().username;
    const group=run('id',['-gn',user],{timeout:5000});
    units(o.root,user,group);
    put(path.join(o.root,'installation.json'),JSON.stringify({managed:!o.noSystemd,port:o.port,createdAt:new Date().toISOString()})+'\n');
    const binary=wrapper(o.root,o.noSystemd);
    if(!o.noSystemd){
      installSystemd(o.root);
      const relay=await health(o.root,false,45000);
      if(!relay)fail('Relay did not become healthy; inspect systemd logs. Secrets and source are preserved.');
      if(o.tailscale){
        // The operator selected public Funnel exposure explicitly. Refuse to
        // replace any existing Tailscale Serve/Funnel routing configuration.
        checkTailscaleAvailable(o.port);
        sudo(['tailscale','funnel','--bg','--yes','--https=443','http://127.0.0.1:'+o.port]);
      }
      startAgent();
      const agentOnline=await health(o.root,true,55000);
      if(!agentOnline)fail('Relay is live but local agent did not connect; run karis doctor.');
    }
    say('INSTALL COMPLETE');
    say('Dashboard: '+url+'/dashboard');
    say('MCP URL:   '+url+'/mcp');
    // Never write passwords to process logs or captured stdout.
    if(process.stdout.isTTY && exists('/dev/tty')){
      fs.writeFileSync('/dev/tty','Admin password (shown once): '+admin+'\n');
    }else say('Admin password saved privately: '+path.join(o.root,'private','admin.key')+' (read it from a secure terminal).');
    say('Commands: '+binary+' status | doctor | update | rollback');
    if(o.noSystemd)say('TEST / NO SYSTEMD MODE: service units generated but not installed or started.');
  } finally{unlock();}
}
async function status(o){
  if(!exists(localEnv(o.root)))fail('No Karis installation at '+o.root);
  const env=readEnv(localEnv(o.root));
  say('Karis Control '+(exists(path.join(o.root,'current','package.json'))?releaseName(path.join(o.root,'current')):'unknown'));
  say('Dashboard: '+env.KARIS_PUBLIC_URL+'/dashboard');
  say('MCP: '+env.KARIS_PUBLIC_URL+'/mcp');
  const config=exists(path.join(o.root,'installation.json'))?JSON.parse(fs.readFileSync(path.join(o.root,'installation.json'),'utf8')):{managed:true};
  if(config.managed){
    for(const unit of [UNIT_RELAY,UNIT_AGENT]){
      const p=spawnSync('systemctl',['is-active',unit],{encoding:'utf8',timeout:4000});
      say(unit+': '+(p.stdout||p.stderr||'not installed').trim());
    }
  }else say('Services: no-systemd test mode (not registered with systemd).');
  const data=await health(o.root,false,2500);
  say('Local relay: '+(data?'OK; devices online '+data.connectedDevices:'not responding'));
}
async function doctor(o){
  if(!exists(localEnv(o.root)))fail('No Karis installation at '+o.root);
  const env=readEnv(localEnv(o.root));
  let ok=true;
  const check=(label,good)=>{say((good?'PASS ':'FAIL ')+label);if(!good)ok=false;};
  check('Node.js >=22.12',versionAtLeast(process.versions.node,'22.12.0'));
  check('Server files',exists(path.join(o.root,'current','selfhost','relay.mjs'))&&exists(path.join(o.root,'current','dist','index.js')));
  for(const name of ['admin.key','agent.key','link.key','relay.env','agent.env']){
    const file=path.join(o.root,'private',name);
    check(name+' private',exists(file) && (fs.statSync(file).mode&0o077)===0);
  }
  check('HTTPS issuer',String(env.KARIS_PUBLIC_URL||'').startsWith('https://') || isLoop(String(env.KARIS_PUBLIC_URL||'')));
  const data=await health(o.root,false,3000);
  check('Relay /healthz',!!data);
  if(data)check('Local agent online',data.connectedDevices>0);
  if(env.KARIS_PUBLIC_URL?.startsWith('https://')){
    try{
      const res=await fetch(env.KARIS_PUBLIC_URL+'/.well-known/oauth-authorization-server',{signal:AbortSignal.timeout(6000)});
      check('Public HTTPS / OAuth metadata',res.ok);
    }catch{check('Public HTTPS / OAuth metadata',false);}
  }
  if(!ok)process.exitCode=1;
}
function releaseTarget(root,name){
  const l=path.join(root,name);
  if(!exists(l))fail('No '+name+' release pointer; cannot proceed.');
  const target=fs.readlinkSync(l);
  if(!path.resolve(target).startsWith(path.join(root,'releases')+path.sep))fail('Release pointer outside managed directory.');
  return target;
}
function swap(root,newPath){
  const old=releaseTarget(root,'current');
  linkAtomic(newPath,path.join(root,'current'));
  linkAtomic(old,path.join(root,'previous'));
  return old;
}
function mutateEnv(root,nextRelease){
  const file=localEnv(root),agentFile=path.join(root,'private','agent.env');
  const version=releaseName(nextRelease);
  const pkg='https://github.com/Karis-tlg/DesktopCommanderMCP/releases/download/selfhost-v'+version+'/karis.tgz';
  for(const [p,key,value] of [[file,'KARIS_VERSION',version],[file,'KARIS_AGENT_PACKAGE_URL',pkg],[agentFile,'KARIS_VERSION',version]]){
    let s=fs.readFileSync(p,'utf8');
    if(!new RegExp('^'+key+'=', 'm').test(s))s+=key+'='+value+'\n';
    else s=s.replace(new RegExp('^'+key+'=.*$', 'm'),key+'='+value);
    replace(p,s);
  }
}
function backup(root){
  const dir=path.join(root,'backups',new Date().toISOString().replace(/[:.]/g,'-'));mkdir(dir);
  for(const name of ['relay.env','agent.env','db.json']){
    const from=path.join(root,'private',name);if(exists(from))fs.copyFileSync(from,path.join(dir,name),fs.constants.COPYFILE_EXCL);
  }
  for(const name of fs.readdirSync(dir))fs.chmodSync(path.join(dir,name),0o600);
  say('Backup stored securely: '+dir);
  return dir;
}
async function update(o){
  if(!exists(localEnv(o.root)))fail('No Karis installation to update.');
  const current=releaseTarget(o.root,'current');
  const unlock=lock(o.root);
  let staged=null;
  try{
    staged=stage(o.root,o.source);
    if(path.resolve(staged)===path.resolve(current) || revision(staged)===revision(current)){
      say('Already up to date.');
      return;
    }
    say('Update: '+releaseName(current)+' -> '+releaseName(staged));
    if(o.dryRun){say('DRY RUN: no service or current pointer changed.');return;}
    if(!o.yes&&!o.noSystemd)fail('Updating live services needs explicit --yes.');
    if(!o.noSystemd)authenticateSudo();
    const saved=backup(o.root);
    swap(o.root,staged);
    try{
      mutateEnv(o.root,staged);
      if(!o.noSystemd){
        systemctl('restart',UNIT_RELAY);
        systemctl('restart',UNIT_AGENT);
        if(!await health(o.root,true,60000))fail('New version failed health check.');
      }
      say('UPDATE PASS. Previous release is available via karis rollback.');
    }catch(e){
      say('UPDATE ERROR: reverting previous release pointer and saved environment.');
      linkAtomic(current,path.join(o.root,'current'));
      for(const name of ['relay.env','agent.env']){
        const prior=path.join(saved,name);if(exists(prior))replace(path.join(o.root,'private',name),fs.readFileSync(prior,'utf8'));
      }
      if(!o.noSystemd){
        try{systemctl('restart',UNIT_RELAY);systemctl('restart',UNIT_AGENT);}catch{}
      }
      throw e;
    }
  }finally{unlock();}
}
async function rollback(o){
  if(!exists(localEnv(o.root)))fail('No Karis installation.');
  const target=releaseTarget(o.root,'previous'),previous=releaseTarget(o.root,'current');
  say('Rollback: '+releaseName(previous)+' -> '+releaseName(target));
  if(o.dryRun){say('DRY RUN.');return;}
  if(!o.yes&&!o.noSystemd)fail('Rollback changes live services; pass --yes.');
  if(!o.noSystemd)authenticateSudo();
  const unlock=lock(o.root);
  try{
    const saved=backup(o.root);
    linkAtomic(target,path.join(o.root,'current'));
    try{
      mutateEnv(o.root,target);
      if(!o.noSystemd){
        systemctl('restart',UNIT_RELAY);systemctl('restart',UNIT_AGENT);
        if(!await health(o.root,true,60000))fail('Rollback health check failed.');
      }
      linkAtomic(previous,path.join(o.root,'previous'));
      say('ROLLBACK PASS.');
    }catch(e){
      linkAtomic(previous,path.join(o.root,'current'));
      for(const name of ['relay.env','agent.env']){
        const backupFile=path.join(saved,name);
        if(exists(backupFile))replace(path.join(o.root,'private',name),fs.readFileSync(backupFile,'utf8'));
      }
      if(!o.noSystemd){try{systemctl('restart',UNIT_RELAY);systemctl('restart',UNIT_AGENT);}catch{}}
      throw e;
    }
  }finally{unlock();}
}
try{
  const o=parse(process.argv.slice(2));
  if(o.cmd==='help'||o.cmd==='--help')printHelp();
  else if(o.cmd==='install')await install(o);
  else if(o.cmd==='status')await status(o);
  else if(o.cmd==='doctor')await doctor(o);
  else if(o.cmd==='update')await update(o);
  else if(o.cmd==='rollback')await rollback(o);
  else fail('Unknown command '+o.cmd);
}catch(err){console.error('Karis: '+(err?.stderr?.toString()?.trim()||err.message));process.exitCode=1;}
