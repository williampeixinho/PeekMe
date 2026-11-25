// Teste isolado: captura apenas a janela sintética e envia vídeo entre dois peers locais.
const {app,BrowserWindow,desktopCapturer,ipcMain,session}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const target=process.argv[2]?path.resolve(process.argv[2]):__dirname;
const quality=process.argv[3]||'720';
process.env.NODE_PATH=[path.join(target,'node_modules'),process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
require('node:module').Module._initPaths();
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'peekme-fps-test-')));
let main;
app.once('browser-window-created',(_event,window)=>{main=window;});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
require(path.join(target,'main.cjs'));
const watchdog=setTimeout(()=>{console.error('FPS_TEST_TIMEOUT');app.exit(1);},60000);
app.whenReady().then(async()=>{
  try{
    for(let i=0;i<160;i++){
      if(main&&!main.webContents.isLoadingMainFrame()&&main.webContents.getURL().startsWith('peekme:'))break;
      await sleep(100);
    }
    if(!main)throw Error('Janela principal não iniciou');
    const fixture=new BrowserWindow({width:1650,height:960,show:false,alwaysOnTop:true,skipTaskbar:true,title:'PeekMe FPS Fixture',webPreferences:{backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}});
    fixture.setIgnoreMouseEvents(true);
    await fixture.loadFile(path.join(__dirname,'fps-fixture.html'));
    fixture.showInactive();
    await sleep(1200);
    const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:0,height:0}});
    const source=sources.find(source=>source.name==='PeekMe FPS Fixture');
    if(!source)throw Error('Janela sintética não disponível para captura');
    // O teste escolhe só a própria janela; não captura aplicativos do usuário.
    ipcMain.removeHandler('peekme:select');
    ipcMain.handle('peekme:select',()=>({title:source.name,application:'fps-fixture'}));
    session.defaultSession.setDisplayMediaRequestHandler((_request,callback)=>callback({video:source}));
    const initialized=await main.webContents.executeJavaScript(`(async()=>{
      document.getElementById('application').replaceChildren(new Option('Teste sintético',${JSON.stringify(source.id)}));
      const q=QUALITIES[${JSON.stringify(quality)}];
      if(!q)throw Error('Qualidade inválida');
      const tracks=await createDesktopTracks(q,false);
      const video=tracks[0].mediaStreamTrack;
      const senderPeer=new RTCPeerConnection({iceServers:[]}),receiverPeer=new RTCPeerConnection({iceServers:[]});
      senderPeer.onicecandidate=e=>{if(e.candidate)receiverPeer.addIceCandidate(e.candidate).catch(()=>{});};
      receiverPeer.onicecandidate=e=>{if(e.candidate)senderPeer.addIceCandidate(e.candidate).catch(()=>{});};
      receiverPeer.ontrack=e=>{
        const v=document.createElement('video');v.autoplay=true;v.muted=true;
        v.srcObject=new MediaStream([e.track]);document.body.append(v);v.play().catch(()=>{});
      };
      // A conexão direta mede a faixa principal. As camadas adaptativas exigem o SFU.
      const encodings=[{...q.encoding}];
      const transceiver=senderPeer.addTransceiver(video,{direction:'sendonly',streams:[new MediaStream([video])],sendEncodings:encodings});
      const sender=transceiver.sender;
      const codec=SCREEN_PUBLISH.videoCodec;
      const caps=RTCRtpSender.getCapabilities('video').codecs.filter(c=>c.mimeType.toLowerCase()==='video/'+codec);
      if(!caps.length)throw Error('Codec indisponível: '+codec);
      transceiver.setCodecPreferences(caps);
      await senderPeer.setLocalDescription(await senderPeer.createOffer());
      await receiverPeer.setRemoteDescription(senderPeer.localDescription);
      await receiverPeer.setLocalDescription(await receiverPeer.createAnswer());
      await senderPeer.setRemoteDescription(receiverPeer.localDescription);
      const params=sender.getParameters();params.degradationPreference=SCREEN_PUBLISH.degradationPreference;
      await sender.setParameters(params);
      window.fpsTest={sender,senderPeer,receiverPeer,tracks,ticks:0,timer:setInterval(()=>window.fpsTest.ticks++,50)};
      return {settings:video.getSettings(),requested:q.resolution,contentHint:video.contentHint,codec,configuredSimulcast:SCREEN_PUBLISH.simulcast,testedSimulcast:false};
    })()`,true);
    // Os IDs da captura nunca são incluídos no relatório.
    delete initialized.settings.deviceId;delete initialized.settings.groupId;
    async function sample(){
      return main.webContents.executeJavaScript(`(async()=>{
        const report=await fpsTest.sender.getStats();const layers=[];let source;
        for(const stat of report.values()){
          if(stat.type==='outbound-rtp'&&stat.kind==='video')layers.push(stat);
          if(stat.type==='media-source'&&stat.kind==='video')source=stat;
        }
        layers.sort((a,b)=>(b.frameWidth||0)*(b.frameHeight||0)-(a.frameWidth||0)*(a.frameHeight||0));
        const outbound=layers[0];
        return {timestamp:outbound?.timestamp,frames:outbound?.framesEncoded||0,width:outbound?.frameWidth,height:outbound?.frameHeight,fps:outbound?.framesPerSecond,reason:outbound?.qualityLimitationReason,encoder:outbound?.encoderImplementation,captureFps:source?.framesPerSecond,ticks:fpsTest.ticks,visibility:document.visibilityState,connection:fpsTest.senderPeer.connectionState,layers:layers.map(l=>({rid:l.rid,width:l.frameWidth,height:l.frameHeight,fps:l.framesPerSecond,encoder:l.encoderImplementation,reason:l.qualityLimitationReason}))};
      })()`);
    }
    await sleep(2000);
    const foregroundStart=await sample();await sleep(4000);const foregroundEnd=await sample();
    main.minimize();
    await sleep(1200);
    const backgroundStart=await sample();await sleep(5000);const backgroundEnd=await sample();
    function delta(a,b){return {...b,fps:Math.round((b.frames-a.frames)*1000/(b.timestamp-a.timestamp)*10)/10,timersPerSecond:Math.round((b.ticks-a.ticks)*1000/(b.timestamp-a.timestamp)*10)/10};}
    const result={backgroundThrottling:main.webContents.getBackgroundThrottling(),capture:initialized,covered:delta(foregroundStart,foregroundEnd),minimized:delta(backgroundStart,backgroundEnd)};
    console.log(JSON.stringify(result));
    await main.webContents.executeJavaScript(`fpsTest.tracks.forEach(t=>t.stop());fpsTest.senderPeer.close();fpsTest.receiverPeer.close();clearInterval(fpsTest.timer);`);
    const passed=!result.backgroundThrottling&&initialized.contentHint==='motion'&&initialized.settings.width<=initialized.requested.width&&initialized.settings.height<=initialized.requested.height&&initialized.settings.frameRate<=initialized.requested.frameRate+1&&result.minimized.fps<=initialized.requested.frameRate+1&&result.minimized.connection==='connected'&&result.minimized.frames>backgroundStart.frames;
    clearTimeout(watchdog);app.exit(passed?0:1);
  }catch(error){clearTimeout(watchdog);console.error(error.stack);app.exit(1);}
});
