import {test} from 'node:test';import assert from 'node:assert/strict';
import {request} from 'node:https';import {randomBytes,randomUUID,generateKeyPairSync} from 'node:crypto';
import {createRequire} from 'node:module';import {spawn} from 'node:child_process';import {writeFile} from 'node:fs/promises';import {join} from 'node:path';
import {startPostgres,freePort} from '../helpers/postgres.mjs';import {startRabbit} from '../helpers/rabbitmq.mjs';
import {provisionEmailTopology} from '../../scripts/provision-email-topology.mjs';
import {provisionReminderTopology} from '../../scripts/provision-reminder-topology.mjs';
import {createTestTls} from '../../backend/services/identity/test/tls.cjs';
import {connectDatabase as connectIdentity} from '../../backend/services/identity/dist/database.js';
import {migrate as migrateIdentity} from '../../backend/services/identity/dist/migrate.js';
import {IdentityKeys} from '../../backend/services/identity/dist/modules/accounts/crypto.js';
import {createApp as createIdentity} from '../../backend/services/identity/dist/app.js';
import {ConfirmPublisher} from '../../backend/services/identity/dist/broker.js';
import {OutboxRelay} from '../../backend/services/identity/dist/outbox.js';
import {connectDatabase as connectNotification} from '../../backend/services/notification/dist/database.js';
import {migrate as migrateNotification} from '../../backend/services/notification/dist/migrate.js';
import {Inbox,DeliveryWorker} from '../../backend/services/notification/dist/modules/delivery/jobs.js';
import {IdentityClient} from '../../backend/services/notification/dist/identity-client.js';
import {SmtpProvider} from '../../backend/services/notification/dist/modules/delivery/mail.js';
import {EmailConsumer} from '../../backend/services/notification/dist/broker.js';
const require=createRequire(new URL('../../backend/services/notification/package.json',import.meta.url));
const {SMTPServer}=require('smtp-server'),{connect}=require('amqplib');
async function until(predicate,label){const end=Date.now()+10000;while(Date.now()<end){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Timed out: '+label);}
test('Identity → RabbitMQ → Notification → SMTP with separate databases and mTLS', {timeout:180000},async t=>{
  const cleanup=[];const defer=close=>cleanup.push(close);t.after(async()=>{const errors=[];for(const close of cleanup.reverse()){try{await close();}catch(error){errors.push(error);}}if(errors.length)throw new AggregateError(errors,'Integration cleanup failed');});
  const pg=await startPostgres();defer(pg.stop);const broker=await startRabbit({reminders:true});defer(broker.stop);t.diagnostic(pg.version+'; '+broker.version);
  await provisionEmailTopology(broker.url);
  await provisionReminderTopology(broker.url);
  const administrator=connectIdentity(pg.connectionString),urls={};
  try{for(const name of ['identity_email','notification_email']){
    const password=randomBytes(24).toString('hex');await administrator.query("CREATE ROLE "+name+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '"+password+"'");
    await administrator.query('CREATE DATABASE '+name+' OWNER '+name);await administrator.query('REVOKE CONNECT ON DATABASE '+name+' FROM PUBLIC');
    const url=new URL(pg.connectionString);url.username=name;url.password=password;url.pathname='/'+name;urls[name]=url.href;
  }}finally{await administrator.close();}
  const identityDb=connectIdentity(urls.identity_email),notificationDb=connectNotification(urls.notification_email);
  defer(()=>identityDb.close());defer(()=>notificationDb.close());await migrateIdentity(identityDb);await migrateNotification(notificationDb);
  const tls=await createTestTls();defer(tls.stop);const pair=generateKeyPairSync('rsa',{modulusLength:2048});
  const keys=new IdentityKeys(pair.privateKey.export({type:'pkcs8',format:'pem'}),'email-test','https://identity.test',randomBytes(32),randomBytes(32));
  let time=new Date();const now=()=>new Date(time),webOrigin='https://web.test';
  const {app}=await createIdentity(identityDb,{keys,webOrigin,callers:tls.callers,tls:{...tls.clients.server,ca:tls.ca}},now);
  await app.listen(0,'127.0.0.1');defer(()=>app.close());const port=app.getHttpServer().address().port;
  function api(path,body,headers={},targetPort=port){return new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port:targetPort,path,method:body===undefined?'GET':'POST',...tls.clients.bff,ca:tls.ca,agent:false,
      headers:{'content-type':'application/json',origin:webOrigin,'x-smartgym-csrf':'1','x-smartgym-client-ip':'192.0.2.10',...headers}},res=>{
      let text='';res.setEncoding('utf8');res.on('data',part=>text+=part);res.on('end',()=>resolve({status:res.statusCode,body:text?JSON.parse(text):null,headers:res.headers}));
    });req.on('error',reject);req.setTimeout(5000,()=>req.destroy(new Error('Timeout')));req.end(body===undefined?undefined:JSON.stringify(body));
  });}
  const client=new IdentityClient('https://127.0.0.1:'+port,{...tls.clients.notification,ca:tls.ca},webOrigin);
  const inbox=new Inbox(notificationDb,now),consumer=new EmailConsumer(inbox);await consumer.start(broker.consumerUrl,true);defer(()=>consumer.close());
  const publisher=await ConfirmPublisher.open(broker.publisherUrl,undefined,true);defer(()=>publisher.close());
  const relay=new OutboxRelay(identityDb,publisher,now),messages=[];
  const smtp=new SMTPServer({authOptional:true,disabledCommands:['AUTH','STARTTLS'],onData(stream,session,callback){let raw='';stream.setEncoding('utf8');stream.on('data',chunk=>raw+=chunk);stream.on('end',()=>{messages.push({raw,recipients:session.envelope.rcptTo.map(v=>v.address)});callback(null,'sandbox-accepted');});}});
  smtp.on('error',()=>{});await new Promise(resolve=>smtp.listen(0,'127.0.0.1',resolve));defer(()=>new Promise(resolve=>{for(const connection of smtp.connections)connection.close();smtp.close(resolve);}));
  const mail=new SmtpProvider({host:'127.0.0.1',port:smtp.server.address().port,from:'noreply@smartgym.test',secure:false,allowLocal:true});defer(()=>mail.close());
  const worker=new DeliveryWorker(notificationDb,client,mail,now);
  const password='Strong SmartGym password 123!';
  async function signup(email){const result=await api('/api/v1/auth/register',{email,password,displayName:'Người tập'});assert.equal(result.status,202);}
  const token=message=>{const text=Buffer.from(message.raw.split('\r\n\r\n').slice(1).join('\r\n\r\n').replaceAll('\r\n',''),'base64').toString('utf8');const match=text.match(/https:\/\/web\.test\/[^\s]+#token=([A-Za-z0-9_-]{43})/);assert.ok(match,'Email must contain the allowed action URL');return match[1];};
  async function waitJob(ref){await until(async()=>!!(await notificationDb.query('SELECT id FROM delivery_jobs WHERE source_ref=$1',[ref])).rows.length,'event committed');}
  const lastAction=async email=>(await identityDb.query('SELECT a.id FROM email_actions a JOIN users u ON u.id=a.user_id WHERE u.email_normalized=$1 AND a.used_at IS NULL AND a.superseded_at IS NULL ORDER BY a.created_at DESC',[email])).rows[0].id;
  await t.test('real confirm/consumer/SMTP completes signup and token works once',async()=>{
    await signup('signup@example.test');const ref=await lastAction('signup@example.test');assert.equal(await relay.tick(),true);await waitJob(ref);
    await worker.tick();assert.equal(messages.length,1);assert.deepEqual(messages[0].recipients,['signup@example.test']);
    const actionToken=token(messages[0]);assert.equal((await api('/api/v1/auth/verify-email',{token:actionToken})).status,204);assert.equal((await api('/api/v1/auth/verify-email',{token:actionToken})).status,410);
    assert.equal((await identityDb.query('SELECT status FROM outbox_events WHERE aggregate_id=$1',[ref])).rows[0].status,'PUBLISHED');
    const event=(await identityDb.query('SELECT payload FROM outbox_events WHERE aggregate_id=$1',[ref])).rows[0].payload;
    await publisher.publish(event);await until(async()=>(await notificationDb.query('SELECT count(*)::integer AS n FROM inbox_events WHERE event_id=$1',[event.id])).rows[0].n===1,'dedup replay');
    await new Promise(resolve=>setTimeout(resolve,100));assert.equal(await worker.tick(),false);assert.equal(messages.length,1);
  });
  await t.test('reset email travels through all services and revokes old session',async()=>{
    const login=await api('/api/v1/auth/login',{email:'signup@example.test',password});assert.equal(login.status,200);const cookie=login.headers['set-cookie'][0].split(';')[0];
    assert.equal((await api('/api/v1/auth/password-reset-requests',{email:'signup@example.test'})).status,202);
    const ref=await lastAction('signup@example.test');await relay.tick();await waitJob(ref);await worker.tick();const resetToken=token(messages.at(-1));
    assert.equal((await api('/api/v1/auth/password-reset',{token:resetToken,newPassword:'New password after email 456!'})).status,204);
    assert.equal((await api('/api/v1/me',undefined,{cookie})).status,401);assert.equal((await api('/api/v1/auth/login',{email:'signup@example.test',password:'New password after email 456!'})).status,200);
  });
  await t.test('lost confirmation retries same ID without duplicate mail job',async()=>{
    await signup('confirm@example.test');const ref=await lastAction('confirm@example.test');
    const lost=new OutboxRelay(identityDb,{publish:async event=>{await publisher.publish(event);throw new Error('Injected confirm lost after broker accept');}},now);
    await assert.rejects(lost.tick(),/unconfirmed/);await waitJob(ref);
    assert.equal((await identityDb.query('SELECT status FROM outbox_events WHERE aggregate_id=$1',[ref])).rows[0].status,'PENDING');
    time=new Date(time.getTime()+5001);await relay.tick();await worker.tick();await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal((await notificationDb.query('SELECT count(*)::integer AS n FROM delivery_jobs WHERE source_ref=$1',[ref])).rows[0].n,1);
    assert.equal(messages.filter(m=>m.recipients.includes('confirm@example.test')).length,1);
  });
  await t.test('mandatory unroutable publish stays pending until binding recovers',async()=>{
    const connection=await connect(broker.url);connection.on('error',()=>{});try{const channel=await connection.createChannel();channel.on('error',()=>{});
      await channel.unbindQueue('smartgym.notification.email.v1','smartgym.events.v1','identity.email-action.requested.v1');
      await signup('routing@example.test');const ref=await lastAction('routing@example.test');await assert.rejects(relay.tick(),/unconfirmed/);
      assert.equal((await identityDb.query('SELECT status FROM outbox_events WHERE aggregate_id=$1',[ref])).rows[0].status,'PENDING');
      await channel.bindQueue('smartgym.notification.email.v1','smartgym.events.v1','identity.email-action.requested.v1');time=new Date(time.getTime()+5001);
      await relay.tick();await waitJob(ref);await worker.tick();assert.equal(messages.filter(m=>m.recipients.includes('routing@example.test')).length,1);
    }finally{await connection.close();}
  });
  await t.test('poison message goes to DLQ; Notification cannot publish or read unrelated queues',async()=>{
    const admin=await connect(broker.url);admin.on('error',()=>{});try{const channel=await admin.createConfirmChannel();channel.on('error',()=>{});
      await new Promise((resolve,reject)=>channel.publish('smartgym.events.v1','identity.email-action.requested.v1',Buffer.from('{"bad":true}'),{appId:'identity',messageId:randomUUID(),contentType:'application/json',persistent:true},error=>error?reject(error):resolve()));
      await until(async()=>(await channel.checkQueue('smartgym.notification.email.dlq.v1')).messageCount===1,'DLQ poison');
      const quarantined=await channel.get('smartgym.notification.email.dlq.v1',{noAck:true});assert.equal(quarantined.content.toString(),'{"bad":true}');
      const restricted=await connect(broker.consumerUrl);restricted.on('error',()=>{});try{
        const denied=await restricted.createConfirmChannel();denied.on('error',()=>{});
        await assert.rejects(new Promise((resolve,reject)=>denied.publish('smartgym.events.v1','identity.email-action.requested.v1',Buffer.from('{}'),{},error=>error?reject(error):resolve())));
        const noDlq=await restricted.createChannel();noDlq.on('error',()=>{});await assert.rejects(noDlq.get('smartgym.notification.email.dlq.v1',{noAck:true}));
      }finally{await restricted.close();}
    }finally{await admin.close();}
  });
  await t.test('two relay replicas claim one pending event without duplicate SMTP delivery',async()=>{
    await signup('replicas@example.test');const ref=await lastAction('replicas@example.test');
    const second=new OutboxRelay(identityDb,publisher,now);
    const claimed=await Promise.all([relay.tick(),second.tick()]);assert.equal(claimed.filter(Boolean).length,1);
    await waitJob(ref);await worker.tick();assert.equal(messages.filter(m=>m.recipients.includes('replicas@example.test')).length,1);
  });
  await t.test('cross-service database credentials and wrong Identity caller are rejected',async()=>{
    const wrong=new URL(urls.notification_email);wrong.pathname='/identity_email';const db=connectNotification(wrong.href);try{await assert.rejects(db.query('SELECT 1'),e=>e.code==='42501');}finally{await db.close();}
    const rogue=new IdentityClient('https://127.0.0.1:'+port,{...tls.clients.bff,ca:tls.ca},webOrigin);await assert.rejects(rogue.resolve(await lastAction('routing@example.test')),e=>e.outcome==='FAILED');
  });
  await t.test('independent relay and Notification process can start/configure/send through published contracts',async()=>{
    time=new Date();
    await consumer.close();await publisher.close();const targetPort=await freePort();
    const environment={...process.env,NOTIFICATION_DATABASE_URL:urls.notification_email,NOTIFICATION_AMQP_URL:broker.consumerUrl,NOTIFICATION_ALLOW_LOOPBACK_PLAINTEXT:'true',
      NOTIFICATION_WEB_ORIGIN:webOrigin,NOTIFICATION_IDENTITY_ORIGIN:'https://127.0.0.1:'+port,
      NOTIFICATION_TLS_KEY_FILE:join(tls.directory,'server.key'),NOTIFICATION_TLS_CERT_FILE:join(tls.directory,'server.crt'),NOTIFICATION_TLS_CA_FILE:join(tls.directory,'ca.crt'),
      NOTIFICATION_IDENTITY_KEY_FILE:join(tls.directory,'notification.key'),NOTIFICATION_IDENTITY_CERT_FILE:join(tls.directory,'notification.crt'),NOTIFICATION_IDENTITY_CA_FILE:join(tls.directory,'ca.crt'),
      NOTIFICATION_PROBE_FINGERPRINTS:JSON.stringify(tls.callers.bff),SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.server.address().port),SMTP_FROM:'noreply@smartgym.test',SMTP_SECURE:'false',HOST:'127.0.0.1',PORT:String(targetPort)};
    delete environment.SMTP_USER;delete environment.SMTP_PASSWORD_FILE;delete environment.AMQP_CA_FILE;delete environment.SMTP_CA_FILE;
    const notification=spawn(process.execPath,['dist/main.js'],{cwd:new URL('../../backend/services/notification/',import.meta.url),env:environment,windowsHide:true,stdio:'ignore'});
    const relayProcess=spawn(process.execPath,['dist/relay-main.js'],{cwd:new URL('../../backend/services/identity/',import.meta.url),env:{...process.env,IDENTITY_DATABASE_URL:urls.identity_email,IDENTITY_AMQP_URL:broker.publisherUrl,BROKER_ALLOW_LOOPBACK_PLAINTEXT:'true'},windowsHide:true,stdio:'ignore'});
    const stop=async child=>{if(child.exitCode!==null||child.signalCode!==null)return;const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;};
    try{
      await until(async()=>{try{return(await api('/health/ready',undefined,{},targetPort)).status===200;}catch{return false;}},'Notification process readiness');
      const before=messages.length;await signup('process@example.test');await until(()=>messages.length===before+1,'separate process SMTP send');
      assert.deepEqual(messages.at(-1).recipients,['process@example.test']);assert.equal((await api('/api/v1/auth/verify-email',{token:token(messages.at(-1))})).status,204);
      await until(async()=>(await notificationDb.query("SELECT count(*)::integer AS n FROM delivery_jobs WHERE status='SENT'")).rows[0].n===messages.length,'independent worker commit');
      await broker.stop();
      await until(async()=>(await api('/health/ready',undefined,{},targetPort)).status===503,'broker failure readiness');
      assert.equal((await api('/health/live',undefined,{},targetPort)).status,200);
      assert.equal((await api('/health/ready')).status,200,'Identity API must remain available with broker stopped');
    }finally{await stop(relayProcess);await stop(notification);}
  });
});
