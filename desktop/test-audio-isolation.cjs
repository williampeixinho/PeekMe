const fs=require('node:fs'),path=require('node:path'),{spawn,fork}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(__dirname,'audio-test-'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function wave(hz){
 const rate=48000,frames=48000,data=Buffer.alloc(frames*4),head=Buffer.alloc(44);
 for(let i=0;i<frames;i++){const v=Math.round(65*Math.sin(2*Math.PI*hz*i/rate));data.writeInt16LE(v,i*4);data.writeInt16LE(v,i*4+2);}
 head.write('RIFF');head.writeUInt32LE(36+data.length,4);head.write('WAVEfmt ',8);head.writeUInt32LE(16,16);head.writeUInt16LE(1,20);head.writeUInt16LE(2,22);head.writeUInt32LE(rate,24);head.writeUInt32LE(rate*4,28);head.writeUInt16LE(4,32);head.writeUInt16LE(16,34);head.write('data',36);head.writeUInt32LE(data.length,40);return Buffer.concat([head,data]);
}
function tone(name,hz){
 const file=path.join(dir,name+'.wav');fs.writeFileSync(file,wave(hz));
 const values={Wave:file,Ready:path.join(dir,name+'.ready'),Play:path.join(dir,name+'.play'),Stop:path.join(dir,'stop')};
 const assignments=Object.entries(values).map(([k,v])=>'$'+k+"='"+v.replaceAll("'","''")+"'").join('\n');
 const source=fs.readFileSync(path.join(__dirname,'test-tone.ps1'),'utf8').replace(/^param\([^\n]*\)\r?\n/,'');
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','-'],{windowsHide:true,stdio:['pipe','ignore','pipe']});
 child.stdin.end(assignments+'\n'+source+'\n');
 child.errors='';child.stderr.on('data',chunk=>{child.errors+=chunk;});
 return child;
}
function magnitude(samples,hz){let re=0,im=0;for(let i=0;i<samples.length;i++){const angle=2*Math.PI*hz*i/48000;re+=samples[i]*Math.cos(angle);im-=samples[i]*Math.sin(angle);}return Math.hypot(re,im)/Math.max(1,samples.length);}
let a,b,worker;
(async()=>{
 try{
  a=tone('selected',500);b=tone('other',1000);
  for(let i=0;i<100&&(!fs.existsSync(path.join(dir,'selected.ready'))||!fs.existsSync(path.join(dir,'other.ready')));i++)await sleep(100);
  if(!fs.existsSync(path.join(dir,'selected.ready'))||!fs.existsSync(path.join(dir,'other.ready')))throw Error('Synthetic audio players did not start: '+a.errors+' '+b.errors);
  fs.writeFileSync(path.join(dir,'other.play'),'');
  let data=[],phase='other-only',leakedBytes=0,readyResolve;
  worker=fork(path.join(__dirname,'capture-worker.cjs'),[],{windowsHide:true,serialization:'advanced',stdio:['ignore','ignore','pipe','ipc']});
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;worker.once('error',reject);worker.once('exit',code=>reject(Error('Capture exited: '+code)));});
  worker.on('message',m=>{if(m.type==='ready')readyResolve();if(m.type==='error')throw Error(m.message);if(m.type==='pcm'){if(phase==='other-only')leakedBytes+=m.data.length;else data.push(m.data);}});
  worker.send({type:'start',pid:a.pid});
  await Promise.race([ready,sleep(12000).then(()=>{throw Error('Capture startup timeout');})]);
  await sleep(1500);
  phase='both';fs.writeFileSync(path.join(dir,'selected.play'),'');await sleep(2500);
  const bytes=Buffer.concat(data);const samples=[];for(let i=0;i+3<bytes.length;i+=4)samples.push(bytes.readInt16LE(i));
  const target=magnitude(samples,500),other=magnitude(samples,1000);
  const result={onlyOtherPlayingBytes:leakedBytes,capturedStereoFrames:samples.length,selectedToneMagnitude:+target.toFixed(3),otherToneMagnitude:+other.toFixed(3),isolationRatio:target?+(other/target).toFixed(5):null};
  console.log(JSON.stringify(result));
  if(leakedBytes!==0||samples.length<4800||target<5||other/target>.03)throw Error('Isolation check failed');
  console.log('PASS: selected process captured; second process excluded. No microphone or desktop mix used.');
 }catch(e){console.error(e.message);process.exitCode=1;}
 finally{
  fs.writeFileSync(path.join(dir,'stop'),'');
  if(worker?.connected)worker.send({type:'stop'});
  await sleep(500);for(const child of[a,b,worker])if(child&&child.exitCode===null)child.kill();
  await sleep(250);
  for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir);
 }
})();
