import {mkdir,access,rename,rm} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {Readable} from 'node:stream';import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';import {execFile} from 'node:child_process';
import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';import {join,resolve,sep} from 'node:path';
if(process.platform!=='win32'||process.arch!=='x64')throw new Error('These portable test artifacts target Windows x64 only');
const directory=fileURLToPath(new URL('../.local/broker-tools/',import.meta.url));await mkdir(directory,{recursive:true});
const artifacts=[
  {name:'otp_win64_28.5.0.7.zip',folder:'otp',expected:'bin/erl.exe',url:'https://github.com/erlang/otp/releases/download/OTP-28.5.0.7/otp_win64_28.5.0.7.zip',sha:'9ff998d7a612b6697f6f737078783557bced63e5bf2a96a9d5f7d7d2a840cb98'},
  {name:'rabbitmq-server-windows-4.4.0.zip',folder:'rabbitmq',expected:'rabbitmq_server-4.4.0/sbin/rabbitmq-server.bat',url:'https://github.com/rabbitmq/rabbitmq-server/releases/download/v4.4.0/rabbitmq-server-windows-4.4.0.zip',sha:'c077a084890e57e1498e479913d4d5bda77e88647e153b433e97f72a31431542'},
];
const exists=async path=>{try{await access(path);return true;}catch{return false;}};
const exec=promisify(execFile);
for(const artifact of artifacts){
  const archive=join(directory,artifact.name);
  if(!await exists(archive)){
    const partial=archive+'.part';
    try{
      const response=await fetch(artifact.url,{signal:AbortSignal.timeout(300000)});
      if(!response.ok||!response.body)throw new Error('Official artifact download failed');
      await pipeline(Readable.fromWeb(response.body),createWriteStream(partial,{flags:'wx'}));
      await rename(partial,archive);
    }catch(error){await rm(partial,{force:true});throw error;}
  }
  const hash=createHash('sha256');for await(const chunk of createReadStream(archive))hash.update(chunk);
  if(hash.digest('hex')!==artifact.sha)throw new Error('Official broker artifact SHA-256 mismatch');
  const output=resolve(directory,artifact.folder);
  if(!output.startsWith(resolve(directory)+sep))throw new Error('Unsafe extraction directory');
  if(!await exists(join(output,artifact.expected))){
    if(await exists(output))throw new Error('Partial extraction exists; inspect it before replacing the target directory');
    const listing=await exec('tar.exe',['-tf',archive],{windowsHide:true,maxBuffer:16*1024*1024,timeout:30000});
    for(const name of listing.stdout.split(/\r?\n/).filter(Boolean))if(/(^[/\\]|(^|[/\\])\.\.([/\\]|$)|:)/.test(name))throw new Error('Unsafe archive entry');
    await mkdir(output);await exec('tar.exe',['-xf',archive,'-C',output],{windowsHide:true,timeout:120000});
    await access(join(output,artifact.expected));
  }
  console.log('Verified local test tool: '+artifact.name);
}
