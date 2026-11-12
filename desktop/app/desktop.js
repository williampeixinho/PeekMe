let desktopAudio=null;
let previewTracks=[];
let previewTimer=null;
async function stopPreview(){
  if(previewTimer)clearInterval(previewTimer);previewTimer=null;
  const tracks=previewTracks;previewTracks=[];
  tracks.forEach(t=>t.stop());
  document.getElementById('preview-video').srcObject=null;
  document.getElementById('preview').hidden=true;
  await stopDesktopAudio();
}
async function startPreview(){
  const error=document.getElementById('start-error');error.textContent='';
  try{
    await stopPreview();
    previewTracks=await createDesktopTracks({resolution:{width:640,height:360,frameRate:15}},document.getElementById('audio').checked);
    const video=document.getElementById('preview-video');
    previewTracks.find(t=>t.kind===LivekitClient.Track.Kind.Video).attach(video);
    document.getElementById('preview').hidden=false;
    previewTimer=setInterval(()=>{
      document.getElementById('audio-meter').value=desktopAudio?.peak||0;
      document.getElementById('preview-status').textContent=video.videoWidth>0?'Prévia ativa — o áudio não é reproduzido no seu PC.':'Carregando imagem…';
    },200);
  }catch(e){await stopPreview();error.textContent=e.message;}
}
async function refreshApplications(){
  const select=document.getElementById('application');
  const current=select.value;select.disabled=true;
  try{
    const apps=await window.peekmeDesktop.listApplications();
    select.replaceChildren(new Option('Escolha o aplicativo que quer transmitir',''),...apps.map(a=>new Option(`${a.application} — ${a.title}`,a.id)));
    if(apps.some(a=>a.id===current))select.value=current;
  }catch(e){document.getElementById('start-error').textContent=e.message;}
  finally{select.disabled=false;}
}
async function stopDesktopAudio(){
  const active=desktopAudio;desktopAudio=null;
  active?.removeListener();active?.removeErrorListener();
  await window.peekmeDesktop.stopAudio().catch(()=>{});
  active?.destination.stream.getTracks().forEach(t=>t.stop());
  await active?.context.close().catch(()=>{});
}
async function createDesktopTracks(q,audio){
  const id=document.getElementById('application').value;
  if(!id)throw Error('Escolha um aplicativo na lista.');
  await window.peekmeDesktop.selectApplication(id);
  const stream=await navigator.mediaDevices.getDisplayMedia({video:{width:q.resolution.width,height:q.resolution.height,frameRate:q.resolution.frameRate},audio:false});
  const tracks=[new LivekitClient.LocalVideoTrack(stream.getVideoTracks()[0],undefined,false)];
  tracks[0].source=LivekitClient.Track.Source.ScreenShare;
  if(audio){
    let context;
    try{
      context=new AudioContext({sampleRate:48000});
      await context.audioWorklet.addModule('/pcm-worklet.js');
      const node=new AudioWorkletNode(context,'peekme-pcm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
      const destination=context.createMediaStreamDestination();node.connect(destination);await context.resume();
      const removeListener=window.peekmeDesktop.onAudio(chunk=>{
        const bytes=new Uint8Array(chunk);node.port.postMessage(bytes);
        const samples=new Int16Array(bytes.buffer,bytes.byteOffset,Math.floor(bytes.byteLength/2));let peak=0;
        for(let i=0;i<samples.length;i++)peak=Math.max(peak,Math.abs(samples[i])/32768);
        if(desktopAudio)desktopAudio.peak=peak;
      });
      const removeErrorListener=window.peekmeDesktop.onAudioError(message=>{document.getElementById('host-status').textContent=message;stopDesktopAudio();});
      desktopAudio={context,node,destination,removeListener,removeErrorListener};
      await window.peekmeDesktop.startAudio();
      const track=new LivekitClient.LocalAudioTrack(destination.stream.getAudioTracks()[0],undefined,false);
      track.source=LivekitClient.Track.Source.ScreenShareAudio;tracks.push(track);
    }catch(e){stream.getTracks().forEach(t=>t.stop());await stopDesktopAudio();await context?.close().catch(()=>{});throw e;}
  }
  stream.getVideoTracks()[0].addEventListener('ended',()=>stopDesktopAudio(),{once:true});
  return tracks;
}
document.getElementById('refresh-apps').addEventListener('click',refreshApplications);
document.getElementById('preview-start').addEventListener('click',startPreview);
document.getElementById('preview-stop').addEventListener('click',stopPreview);
window.addEventListener('pagehide',()=>stopDesktopAudio());
refreshApplications();
