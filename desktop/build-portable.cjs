const fs=require('node:fs'),path=require('node:path');
const out=path.join(__dirname,'PeekMe-Windows');
if(fs.existsSync(out))throw Error('Portable directory already exists; inspect it before rebuilding');
fs.cpSync(path.join(__dirname,'node_modules/electron/dist'),out,{recursive:true});
fs.renameSync(path.join(out,'electron.exe'),path.join(out,'PeekMe.exe'));
const dest=path.join(out,'resources/app');fs.mkdirSync(dest,{recursive:true});
for(const name of['main.cjs','preload.cjs','capture-worker.cjs','package.json','app'])fs.cpSync(path.join(__dirname,name),path.join(dest,name),{recursive:true});
for(const name of['loopback-capture','livekit-client','bindings','file-uri-to-path'])fs.cpSync(path.join(__dirname,'node_modules',name),path.join(dest,'node_modules',name),{recursive:true});
console.log(path.join(out,'PeekMe.exe'));
