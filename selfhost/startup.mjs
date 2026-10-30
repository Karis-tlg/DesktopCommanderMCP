import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WIN_TASK = 'Karis-RemoteCommander-SelfHost';
const USER_UNIT = 'karis-desktop-commander-agent.service';
const OWNED_MARKER = '# managed-by: Karis Desktop Commander startup';
const quotePs = value => "'" + String(value).replaceAll("'", "''") + "'";
const quotedUnit = value => '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
const fail = message => ({supported:false, enabled:null, configured:false, mode:'unknown', reason:message});
const run = (command, args, timeout=5000) => execFileSync(command,args,{
  encoding:'utf8', windowsHide:true, timeout,maxBuffer:128*1024,
  stdio:['ignore','pipe','pipe']
}).trim();
const win = command => run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; "+command]);
const winInspect = () => {
  const query = "$t=Get-ScheduledTask -TaskName " + quotePs(WIN_TASK) + " -ErrorAction SilentlyContinue;" +
    "if(-not $t){'missing'}" +
    "elseif(@($t.Actions|Where-Object {$_.Execute -like '*node.exe' -and $_.Arguments -like '*remote*' -and $_.Arguments -match '(?i)(KarisRemoteCommander|@karis-tlg)'}).Count -eq 0){'foreign'}" +
    "elseif($t.Settings.Enabled){'enabled'}else{'disabled'}";
  return win(query).split(/\r?\n/).at(-1).trim();
};
const unitPath = () => path.join(os.homedir(),'.config','systemd','user',USER_UNIT);
function hasSavedLogin(configDir) {
  try {
    const content=JSON.parse(fs.readFileSync(path.join(configDir,'config.json'),'utf8'));
    return typeof content.endpoint==='string' && typeof content.token==='string' && content.token.length>=32;
  } catch { return false; }
}
function linuxInfo(protectedDevice=false) {
  if (protectedDevice) {
    try {
      const value=run('systemctl',['is-enabled','karis-mcp-agent.service']);
      return { supported:true, configured:true, enabled:value==='enabled', mode:'system', managed:true };
    } catch {
      return { supported:false, configured:false, enabled:null, mode:'system', managed:true, reason:'Không đọc được service hệ thống' };
    }
  }
  try {
    run('systemctl',['--user','show-environment']);
    const file=unitPath();
    if (!fs.existsSync(file)) return { supported:true,configured:false,enabled:false,mode:'login',managed:false };
    if (!fs.readFileSync(file,'utf8').startsWith(OWNED_MARKER)) return fail('Đã tồn tại service không thuộc Karis; không thay đổi');
    let enabled=false;
    try { enabled=run('systemctl',['--user','is-enabled',USER_UNIT])==='enabled'; } catch {}
    return {supported:true,configured:true,enabled,mode:'login',managed:false};
  } catch { return fail('Không có systemd user session trên thiết bị'); }
}
export function readStartup({platform=process.platform,protectedDevice=false}={}) {
  if(platform==='linux')return linuxInfo(protectedDevice);
  if(platform==='win32'){
    try {
      const result=winInspect();
      if(result==='foreign')return fail('Scheduled Task cùng tên không thuộc Karis; không được thay đổi');
      if(!['missing','enabled','disabled'].includes(result))return fail('Không xác định được cấu hình Scheduled Task');
      return {supported:true,configured:result!=='missing',enabled:result==='enabled',mode:'login',managed:false};
    } catch {return fail('Windows Task Scheduler không khả dụng cho tài khoản hiện tại');}
  }
  return fail('Hệ điều hành này chưa hỗ trợ bật/tắt tự khởi động từ dashboard');
}
export function setStartup(action, {platform=process.platform,configDir,entry,nodePath=process.execPath,protectedDevice=false}={}){
  if(action!=='enable'&&action!=='disable')throw Error('Invalid startup action');
  if(protectedDevice)throw Error('Thiết bị hệ thống dùng service riêng; không thay đổi từ dashboard');
  const before=readStartup({platform,protectedDevice});
  if(!before.supported)throw Error(before.reason||'Không hỗ trợ cấu hình tự khởi động');
  if(platform==='win32'){
    if(action==='enable'){
      if(!before.configured){
        if(configDir!==path.join(os.homedir(),'.karis-desktop-commander-agent'))throw Error('Cấu hình agent tùy chỉnh chưa hỗ trợ tạo Scheduled Task tự động');
        if(!hasSavedLogin(configDir))throw Error('Máy chưa lưu khóa ghép nối; hãy ghép nối lại và không dùng --no-save');
        if(!entry||!fs.existsSync(entry))throw Error('Không tìm thấy CLI đã cài trên máy này');
        const argumentsValue = quotePs('"' + entry + '" remote');
        const cmd = '$action=New-ScheduledTaskAction -Execute ' + quotePs(nodePath) +
          ' -Argument ' + argumentsValue + ' -WorkingDirectory ' + quotePs(path.dirname(entry)) + ';' +
          '$trigger=New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name);' +
          '$principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited;' +
          '$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable;' +
          'Register-ScheduledTask -TaskName ' + quotePs(WIN_TASK) + ' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description ' + quotePs('Private Karis Desktop Commander agent on user logon') + ' | Out-Null';
        win(cmd);
      }else win('Enable-ScheduledTask -TaskName '+quotePs(WIN_TASK)+' | Out-Null');
    }else if(before.configured)win('Disable-ScheduledTask -TaskName '+quotePs(WIN_TASK)+' | Out-Null');
  }else if(platform==='linux'){
    const file=unitPath();
    if(action==='enable'){
      if(!before.configured){
        if(!hasSavedLogin(configDir))throw Error('Máy chưa lưu khóa ghép nối; hãy ghép nối lại và không dùng --no-save');
        if(!entry||!fs.existsSync(entry))throw Error('Không tìm thấy CLI đã cài trên máy này');
        const data=[OWNED_MARKER,'[Unit]','Description=Karis Desktop Commander agent on login','After=network-online.target',
          '[Service]','Type=simple',
          'ExecStart='+quotedUnit(nodePath)+' '+quotedUnit(entry)+' remote',
          'WorkingDirectory='+quotedUnit(path.dirname(entry)),
          ...(configDir && configDir!==path.join(os.homedir(),'.karis-desktop-commander-agent')
             ? ['Environment=KARIS_AGENT_CONFIG_DIR='+quotedUnit(configDir)]:[]),
          'Restart=on-failure','RestartSec=8','[Install]','WantedBy=default.target',''].join('\n');
        fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
        fs.writeFileSync(file,data,{mode:0o600,flag:'wx'});
      }
      run('systemctl',['--user','daemon-reload']);
      run('systemctl',['--user','enable',USER_UNIT]);
    }else if(before.configured)run('systemctl',['--user','disable',USER_UNIT]);
  }else throw Error('Hệ điều hành chưa hỗ trợ');
  const after=readStartup({platform,protectedDevice});
  if(!after.supported || after.enabled!==(action==='enable'))throw Error('Không thể xác nhận trạng thái tự khởi động sau thao tác');
  return after;
}
