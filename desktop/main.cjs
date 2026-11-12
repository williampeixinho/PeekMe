const {app, BrowserWindow, desktopCapturer, ipcMain, protocol, net, session} = require('electron');
const {execFile, fork} = require('node:child_process');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const SERVER = 'https://peekme.devpeixinho.uk';
const ROOT = path.join(__dirname,'app');
protocol.registerSchemesAsPrivileged([{scheme:'peekme',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
let win, sources=new Map(), selected=null, audioWorker=null;
const isLocal = url => {try{const u=new URL(url);return u.protocol==='peekme:'&&u.hostname==='app';}catch{return false;}};
function requireLocal(event){if(event.sender!==win?.webContents||!isLocal(event.senderFrame?.url))throw Error('Origem não autorizada.');}
// O desktopCapturer do Electron omite janelas minimizadas (jogos em tela cheia minimizam no Alt+Tab),
// então a lista vem do próprio Windows e a janela é restaurada só na hora de escolher.
const WINDOW_API = `using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class PeekMeWin {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int c);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  public static List<IntPtr> List(){
    var r=new List<IntPtr>();
    EnumWindows((h,l)=>{
      if(!IsWindowVisible(h)||GetWindow(h,4)!=IntPtr.Zero||(GetWindowLong(h,-20)&0x80)!=0)return true;
      int cloaked; if(DwmGetWindowAttribute(h,14,out cloaked,4)==0&&cloaked!=0)return true;
      r.Add(h); return true;
    },IntPtr.Zero);
    return r;
  }
  public static string Title(IntPtr h){var s=new StringBuilder(512);GetWindowText(h,s,512);return s.ToString();}
}`;
// handles=null lista todas as janelas; restore=true restaura as minimizadas da lista dada.
function windowInfo(handles=null,restore=false){
  const ids=(handles||[]).filter(h=>/^\d+$/.test(String(h)));
  const code=`$mode='${handles?'ids':'list'}'; $ids=@(${ids.map(h=>`'${h}'`).join(',')}); $restore=$${restore};
Add-Type -TypeDefinition @'
${WINDOW_API}
'@
$out=@()
$list=if($mode -eq 'list'){[PeekMeWin]::List()}else{$ids|ForEach-Object{[IntPtr]::new([int64]$_)}}
foreach($h in $list){
  $title=[PeekMeWin]::Title($h); if($mode -eq 'list' -and -not $title){continue}
  $owner=[uint32]0; [void][PeekMeWin]::GetWindowThreadProcessId($h,[ref]$owner); if($owner -eq 0){continue}
  $min=[PeekMeWin]::IsIconic($h); if($restore -and $min){[void][PeekMeWin]::ShowWindowAsync($h,9)}
  $started=''
  try{$proc=Get-Process -Id $owner -ErrorAction Stop}catch{continue}
  try{$started=$proc.StartTime.ToUniversalTime().Ticks.ToString()}catch{}
  $out+=@{handle=[string][int64]$h;pid=$owner;name=$proc.ProcessName;started=$started;title=$title;minimized=[bool]$min}
}
ConvertTo-Json -InputObject @($out) -Compress`;
  return new Promise((resolve,reject)=>{
    execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{windowsHide:true,timeout:20000,maxBuffer:4*1024*1024},(error,out)=>{
      if(error)return reject(Error('Não foi possível listar os aplicativos do Windows.'));
      try{resolve(JSON.parse(out.replace(/^﻿/,''))||[]);}catch{reject(Error('A lista de aplicativos não pôde ser lida.'));}
    });
  });
}
const IGNORED=/^(codex-computer-use|nvidia overlay|textinputhost|shellexperiencehost|searchhost|startmenuexperiencehost|lockapp)$/i;
async function captureSources(){
  const list=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:0,height:0},fetchWindowIcons:false});
  return new Map(list.filter(s=>/^window:\d+:/.test(s.id)).map(s=>[s.id.split(':')[1],s]));
}
async function listApplications(){
  const [windows,captured]=await Promise.all([windowInfo(),captureSources()]);
  sources.clear();
  for(const info of windows){
    if(info.pid===process.pid||IGNORED.test(info.name)||(info.name==='explorer'&&info.title==='Program Manager'))continue;
    const source=captured.get(info.handle);
    const id=source?.id||`window:${info.handle}:0`;
    sources.set(id,{id,source,...info,title:source?.name||info.title});
  }
  return [...sources.values()].map(x=>({id:x.id,title:x.minimized?`${x.title} (minimizado)`:x.title,application:x.name})).sort((a,b)=>a.application.localeCompare(b.application));
}
async function validateSelection(id,restore=false){
  const candidate=sources.get(String(id));
  if(!candidate)throw Error('Atualize a lista e escolha um aplicativo.');
  const [current]=await windowInfo([candidate.handle],restore);
  if(!current||current.pid!==candidate.pid||current.started!==candidate.started)throw Error('O aplicativo foi fechado ou reiniciado. Atualize a lista.');
  if(restore||!candidate.source){
    // Depois de restaurar, espera o Electron enxergar a janela.
    candidate.source=null;
    for(let i=0;i<15;i++){
      const source=(await captureSources()).get(candidate.handle);
      if(source){candidate.source=source;candidate.minimized=false;break;}
      await new Promise(r=>setTimeout(r,300));
    }
    if(!candidate.source)throw Error('Não consegui acessar essa janela. Abra o aplicativo, volte aqui e tente de novo.');
  }
  return candidate;
}
async function stopAudio(){
  const child=audioWorker; audioWorker=null;
  if(!child)return;
  await new Promise(resolve=>{
    const timeout=setTimeout(()=>{child.kill();resolve();},2500);
    child.once('exit',()=>{clearTimeout(timeout);resolve();});
    if(child.connected)child.send({type:'stop'});else {clearTimeout(timeout);resolve();}
  });
}
async function startAudio(){
  if(!selected)throw Error('Escolha um aplicativo antes de transmitir.');
  const candidate=await validateSelection(selected.id);
  await stopAudio();
  const child=fork(path.join(__dirname,'capture-worker.cjs'),[],{execPath:process.execPath,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,serialization:'advanced',stdio:['ignore','ignore','pipe','ipc']});
  audioWorker=child;
  return new Promise((resolve,reject)=>{
    let ready=false;
    const timeout=setTimeout(()=>{if(!ready){child.kill();reject(Error('O Windows demorou para iniciar a captura de áudio.'));}},12000);
    child.on('message',message=>{
      if(message.type==='ready'){ready=true;clearTimeout(timeout);resolve({sampleRate:48000,channels:2});}
      else if(message.type==='pcm'&&audioWorker===child&&!win?.isDestroyed())win.webContents.send('peekme:pcm',message.data);
      else if(message.type==='error'){
        clearTimeout(timeout);
        if(!ready)reject(Error(message.message));
        else if(!win?.isDestroyed())win.webContents.send('peekme:audio-error',message.message);
      }
    });
    child.once('exit',()=>{clearTimeout(timeout);if(audioWorker===child)audioWorker=null;if(!ready)reject(Error('O capturador de áudio foi encerrado.'));});
    child.once('error',()=>{clearTimeout(timeout);reject(Error('Não foi possível iniciar o capturador de áudio.'));});
    child.send({type:'start',pid:candidate.pid});
  });
}

app.whenReady().then(async()=>{
  protocol.handle('peekme',request=>{
    const u=new URL(request.url);
    const allowed={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/icon.svg':'icon.svg','/pcm-worklet.js':'pcm-worklet.js','/desktop.js':'desktop.js'};
    let filename=allowed[u.pathname]&&path.join(ROOT,allowed[u.pathname]);
    if(u.hostname!=='app')return new Response('Não autorizado',{status:403});
    if(u.pathname==='/vendor/livekit-client.js')filename=require.resolve('livekit-client');
    if(!filename)return new Response('Não encontrado',{status:404});
    return net.fetch(pathToFileURL(filename).href);
  });
  win=new BrowserWindow({width:1050,height:780,minWidth:700,minHeight:620,title:'PeekMe para Windows',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(!isLocal(url))event.preventDefault();});
  win.webContents.on('render-process-gone',()=>stopAudio());
  session.defaultSession.setPermissionCheckHandler((contents,permission)=>contents===win.webContents&&isLocal(contents.getURL())&&permission==='display-capture');
  session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>callback(contents===win.webContents&&isLocal(contents.getURL())&&permission==='display-capture'));
  session.defaultSession.setDisplayMediaRequestHandler(async(request,callback)=>{
    try{
      if(!isLocal(request.frame?.url)||!selected)return callback({});
      const candidate=await validateSelection(selected.id);
      callback({video:candidate.source});
    }catch{callback({});}
  });
  ipcMain.handle('peekme:apps',async(event)=>{requireLocal(event);return listApplications();});
  ipcMain.handle('peekme:select',async(event,id)=>{requireLocal(event);selected=await validateSelection(id,true);return {title:selected.title,application:selected.name};});
  ipcMain.handle('peekme:audio-start',async(event)=>{requireLocal(event);return startAudio();});
  ipcMain.handle('peekme:audio-stop',async(event)=>{requireLocal(event);await stopAudio();return true;});
  ipcMain.handle('peekme:api',async(event,route,body)=>{
    requireLocal(event);
    if(!['/api/start','/api/stop','/api/watch','/api/share','/api/unshare'].includes(route))throw Error('Operação não permitida.');
    if(JSON.stringify(body).length>10000)throw Error('Pedido muito grande.');
    const response=await fetch(SERVER+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const data=await response.json();return {ok:response.ok,status:response.status,data};
  });
  win.on('closed',()=>{stopAudio();win=null;});
  await win.loadURL('peekme://app/index.html');
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{if(audioWorker)audioWorker.kill();});
