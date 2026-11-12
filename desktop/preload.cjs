const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('peekmeDesktop',{
  server:'https://peekme.devpeixinho.uk',
  listApplications:()=>ipcRenderer.invoke('peekme:apps'),
  selectApplication:id=>ipcRenderer.invoke('peekme:select',id),
  startAudio:()=>ipcRenderer.invoke('peekme:audio-start'),
  stopAudio:()=>ipcRenderer.invoke('peekme:audio-stop'),
  api:(route,body)=>ipcRenderer.invoke('peekme:api',route,body),
  onAudio:callback=>{const listener=(_,data)=>callback(data);ipcRenderer.on('peekme:pcm',listener);return ()=>ipcRenderer.removeListener('peekme:pcm',listener);},
  onAudioError:callback=>{const listener=(_,message)=>callback(message);ipcRenderer.on('peekme:audio-error',listener);return ()=>ipcRenderer.removeListener('peekme:audio-error',listener);}
});
