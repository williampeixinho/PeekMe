const {LoopbackCapture}=require('loopback-capture');
let capture=null;
function stop(){try{capture?.stop();}catch{}capture=null;process.exit(0);}
process.on('message',message=>{
  if(message.type==='stop')return stop();
  if(message.type!=='start'||capture)return;
  if(!Number.isInteger(message.pid)||message.pid<=0)return process.send?.({type:'error',message:'Aplicativo inválido.'});
  try{
    capture=new LoopbackCapture();
    capture.start(message.pid,chunk=>{
      // PCM stays in memory; only this process tree is captured. Never fall back to system audio.
      if(process.connected&&chunk.length<=192000)process.send({type:'pcm',data:chunk});
    });
    process.send?.({type:'ready'});
  }catch(e){process.send?.({type:'error',message:'Falha ao capturar o áudio do aplicativo: '+e.message});setTimeout(stop,100);}
});
process.on('disconnect',stop);
process.on('SIGTERM',stop);
