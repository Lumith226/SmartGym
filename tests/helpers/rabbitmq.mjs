import { spawn,execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir,mkdtemp,writeFile,rm,readdir,access } from 'node:fs/promises';
import { resolve,join,sep } from 'node:path';
import { randomBytes,createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { freePort } from './postgres.mjs';
const require=createRequire(new URL('../../backend/apps/notification/package.json',import.meta.url));
const {connect}=require('amqplib');
export async function startRabbit({publisher='identity',reminders=false}={}){
  if(!['identity','workout','catalog'].includes(publisher))throw new Error('Unknown fixture publisher');
  const publisherName=publisher+'_pub';
  const publisherTopic=publisher==='catalog'?'^catalog\\.exercise\\.(published|updated|unpublished)\\.v1$':publisher==='workout'?'^workout\\.occurrence\\.changed\\.v1$':'^identity\\.email-action\\.requested\\.v1$';
  if(process.platform!=='win32')throw new Error('Portable Rabbit runner requires Windows; set integration environment for your platform');
  const tools=resolve('.local/broker-tools'),erlang=join(tools,'otp'),script=join(tools,'rabbitmq/rabbitmq_server-4.4.0/sbin/rabbitmq-server.bat');
  const erts=(await readdir(erlang)).find(name=>name.startsWith('erts-'));
  if(!erts)throw new Error('Erlang runtime not prepared');
  const epmdBinary=join(erlang,erts,'bin/epmd.exe');await access(epmdBinary);await access(script);
  const base=resolve('.local/rabbitmq-tests');await mkdir(base,{recursive:true});const directory=await mkdtemp(join(base,'run-'));
  const port=await freePort(),dist=await freePort(),epmd=await freePort(),password=randomBytes(24).toString('hex'),cookie=randomBytes(24).toString('hex');
  const publisherPassword=randomBytes(24).toString('hex'),consumerPassword=randomBytes(24).toString('hex');
  const user=(name,password)=>{const salt=randomBytes(4);return{name,password_hash:Buffer.concat([salt,createHash('sha256').update(Buffer.concat([salt,Buffer.from(password)])).digest()]).toString('base64'),hashing_algorithm:'rabbit_password_hashing_sha256',tags:[]};};
  await writeFile(join(directory,'definitions.json'),JSON.stringify({vhosts:[{name:'smartgym_test'}],exchanges:[{name:'smartgym.events.v1',vhost:'smartgym_test',type:'topic',durable:true,auto_delete:false,internal:false,arguments:{}}],users:[user('sg_test',password),user(publisherName,publisherPassword),user('notification_sub',consumerPassword)],permissions:[
    {user:'sg_test',vhost:'smartgym_test',configure:'.*',write:'.*',read:'.*'},
    {user:publisherName,vhost:'smartgym_test',configure:'^$',write:'^smartgym\\.events\\.v1$',read:'^$'},
    {user:'notification_sub',vhost:'smartgym_test',configure:'^$',write:'^$',read:reminders?'^smartgym\\.notification\\.(email|workout)\\.v1$':'^smartgym\\.notification\\.email\\.v1$'},
  ],topic_permissions:[{user:publisherName,vhost:'smartgym_test',exchange:'smartgym.events.v1',write:publisherTopic,read:'^$'}]}));
  await writeFile(join(directory,'rabbitmq.conf'),`listeners.tcp.1 = 127.0.0.1:${port}\ndefault_user = sg_test\ndefault_pass = ${password}\ndefault_vhost = smartgym_test\nloopback_users.guest = true\nvm_memory_high_watermark.absolute = 256MiB\ndisk_free_limit.absolute = 50MB\ndefinitions.import_backend = local_filesystem\ndefinitions.local.path = ${join(directory,'definitions.json').replaceAll('\\','/')}\n`);
  await writeFile(join(directory,'enabled_plugins'),'[].\n');await writeFile(join(directory,'env.bat'),'@echo off\n');
  const env={...process.env,ERLANG_HOME:erlang,ERL_EPMD_ADDRESS:'127.0.0.1',ERL_EPMD_PORT:String(epmd),RABBITMQ_DIST_PORT:String(dist),
    RABBITMQ_BASE:directory,RABBITMQ_NODENAME:'sg_'+randomBytes(5).toString('hex')+'@localhost',RABBITMQ_ERLANG_COOKIE:cookie,
    RABBITMQ_CONFIG_FILE:join(directory,'rabbitmq'),RABBITMQ_CONF_ENV_FILE:join(directory,'env.bat'),
    RABBITMQ_ENABLED_PLUGINS_FILE:join(directory,'enabled_plugins'),RABBITMQ_MNESIA_BASE:join(directory,'data'),RABBITMQ_LOG_BASE:join(directory,'logs'),
    RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS:'+S 2:2 -kernel inet_dist_use_interface {127,0,0,1}'};
  const epmdProcess=spawn(epmdBinary,['-address','127.0.0.1','-port',String(epmd)],{env,cwd:tools,windowsHide:true,stdio:'ignore'});
  const epmdExited=new Promise(resolve=>{epmdProcess.once('exit',resolve);epmdProcess.once('error',resolve);});
  await new Promise((resolve,reject)=>{epmdProcess.once('spawn',resolve);epmdProcess.once('error',reject);});
  const child=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c','""'+script+'""'],{env,cwd:directory,windowsHide:true,windowsVerbatimArguments:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>{output=(output+chunk).slice(-8000);});child.stderr.on('data',chunk=>{output=(output+chunk).slice(-8000);});
  let stopped=false;const exited=new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});
  async function stop(){
    if(stopped)return;stopped=true;
    // Stop this random node via its private EPMD port, then only its own process tree if needed.
    const ctl=join(tools,'rabbitmq/rabbitmq_server-4.4.0/sbin/rabbitmqctl.bat');
    try{if(child.exitCode===null&&child.signalCode===null)await promisify(execFile)(process.env.ComSpec??'cmd.exe',['/d','/s','/c','""'+ctl+'" stop"'],{env,cwd:directory,windowsHide:true,windowsVerbatimArguments:true,timeout:30000});}catch{
      if(child.exitCode===null)await promisify(execFile)('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:10000}).catch(()=>{});
    }
    await exited;
    if(epmdProcess.exitCode===null&&epmdProcess.signalCode===null)epmdProcess.kill();await epmdExited;
    if(resolve(directory).startsWith(base+sep))await rm(directory,{recursive:true,force:true,maxRetries:8,retryDelay:300});
  }
  const url=`amqp://sg_test:${password}@127.0.0.1:${port}/smartgym_test?heartbeat=5`;
  try{
    const deadline=Date.now()+90000;
    while(Date.now()<deadline&&child.exitCode===null){
      try{const connection=await connect(url,{timeout:1000});connection.on('error',()=>{});await connection.close();
        const publisherUrl=new URL(url);publisherUrl.username=publisherName;publisherUrl.password=publisherPassword;
        const consumerUrl=new URL(url);consumerUrl.username='notification_sub';consumerUrl.password=consumerPassword;
        return{url,publisherUrl:publisherUrl.href,consumerUrl:consumerUrl.href,stop,version:'RabbitMQ 4.4.0 / Erlang 28.5.0.7'};
      }catch{}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    throw new Error('Portable Rabbit startup failed: '+output.replaceAll(password,'[redacted]').replaceAll(cookie,'[redacted]').replaceAll(publisherPassword,'[redacted]').replaceAll(consumerPassword,'[redacted]'));
  }catch(error){await stop();throw error;}
}
