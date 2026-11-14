import {test} from 'node:test';import assert from 'node:assert/strict';
import {request} from 'node:https';import {randomUUID,randomBytes,generateKeyPairSync,sign} from 'node:crypto';
import {join} from 'node:path';
import {startPostgres} from '../helpers/postgres.mjs';import {createTestTls} from '../../backend/apps/identity/test/tls.cjs';
import {connectDatabase} from '../../backend/apps/notification/dist/database.js';import {migrate} from '../../backend/apps/notification/dist/migrate.js';
import {createApp} from '../../backend/apps/notification/dist/app.js';import {ReminderInbox,ReminderWorker} from '../../backend/apps/notification/dist/modules/inbox/reminders.js';
import {Inbox,DeliveryWorker} from '../../backend/apps/notification/dist/modules/delivery/jobs.js';
import {createApp as createIdentity} from '../../backend/apps/identity/dist/app.js';import {migrate as migrateIdentity} from '../../backend/apps/identity/dist/migrate.js';import {IdentityKeys} from '../../backend/apps/identity/dist/modules/accounts/crypto.js';
test('T20 owner Notification APIs over PostgreSQL and Identity mTLS/JWKS',{timeout:120000},async t=>{
  const cleanup=[];t.after(async()=>{for(const close of cleanup.reverse())await close();});const pg=await startPostgres();cleanup.push(pg.stop);
  const admin=connectDatabase(pg.connectionString),urls={};try{for(const name of ['inbox_identity','inbox_notification']){const password=randomBytes(24).toString('hex');await admin.query("CREATE ROLE "+name+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '"+password+"'");await admin.query('CREATE DATABASE '+name+' OWNER '+name);await admin.query('REVOKE CONNECT ON DATABASE '+name+' FROM PUBLIC');const u=new URL(pg.connectionString);u.username=name;u.password=password;u.pathname='/'+name;urls[name]=u.href;}}finally{await admin.close();}
  const db=connectDatabase(urls.inbox_notification),idb=connectDatabase(urls.inbox_identity);cleanup.push(()=>db.close(),()=>idb.close());await migrate(db);await migrateIdentity(idb);
  const tls=await createTestTls();cleanup.push(tls.stop);const pair=generateKeyPairSync('rsa',{modulusLength:2048});const keys=new IdentityKeys(pair.privateKey.export({type:'pkcs8',format:'pem'}),'inbox-test','https://identity.test',randomBytes(32),randomBytes(32));
  const {app:identity}=await createIdentity(idb,{keys,callers:tls.callers,webOrigin:'https://web.test',tls:{...tls.clients.server,ca:tls.ca}});await identity.listen(0,'127.0.0.1');cleanup.push(()=>identity.close());
  const config={tls:{...tls.clients.server,ca:tls.ca},probeFingerprints:tls.callers.bff,auth:{tls:{...tls.clients.server,ca:tls.ca},bffFingerprints:tls.callers.bff,identity:{...tls.clients.notification,ca:tls.ca,origin:'https://127.0.0.1:'+identity.getHttpServer().address().port,issuer:'https://identity.test'}}};
  const time=new Date(),now=()=>new Date(time);let ready=true,dbFailure=false;
  const wrapped={...db,query:(...args)=>{if(dbFailure)throw Error('PRIVATE SQL password=secret');return db.query(...args);},transaction:(...args)=>{if(dbFailure)throw Error('PRIVATE SQL');return db.transaction(...args);}};
  const app=await createApp(wrapped,config,()=>ready,now);await app.listen(0,'127.0.0.1');cleanup.push(()=>app.close());const port=app.getHttpServer().address().port,owner=randomUUID(),other=randomUUID();
  const token=(user=owner,role='USER',expired=false)=>keys.assertion(user,role,new Date(Date.now()-10000),new Date(Date.now()+(expired?-1000:290000))).accessToken;
  function call(path='/api/v1/notifications',{method='GET',body,headers={},actor=owner,role='USER',cert=tls.clients.bff,bearer=token(actor,role),target=port,raw}={}){return new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port:target,path,method,...cert,ca:tls.ca,agent:false,signal:AbortSignal.timeout(6000),headers:{authorization:'Bearer '+bearer,'content-type':'application/json',...headers}},res=>{let text='';res.on('data',v=>text+=v);res.on('end',()=>resolve({status:res.statusCode,body:text?JSON.parse(text):null,headers:res.headers,text}));});req.on('error',reject);req.end(raw??(body===undefined?undefined:JSON.stringify(body)));});}
  const inbox=new ReminderInbox(db,now),worker=new ReminderWorker(db,{contact:async()=>{throw Error('In-app must not resolve');}},{sendReminder:async()=>{throw Error('Default email disabled');}},now);
  const event=(user=owner)=>{const id=randomUUID();return{id:randomUUID(),type:'workout.occurrence.changed.v1',producer:'workout',schemaVersion:1,occurredAt:now().toISOString(),aggregateId:id,aggregateVersion:1,correlationId:randomUUID(),data:{occurrenceId:id,userId:user,status:'SCHEDULED',startAt:new Date(time.getTime()+1800000).toISOString(),endAt:new Date(time.getTime()+5400000).toISOString(),timeZone:'Asia/Bangkok'}};};
  const accept=e=>inbox.accept(Buffer.from(JSON.stringify(e)));const preferences='/api/v1/notification-preferences';
  const update=(body,etag,options={})=>call(preferences,{method:'PUT',body,headers:{...(etag?{'if-match':etag}:{}),...options.headers},...options});
  const input={reminderInAppEnabled:true,reminderEmailEnabled:false,leadMinutes:60};
  await t.test('defaults are durable and concurrent first reads return v1; inbox empty has true unread count',async()=>{
    const results=await Promise.all([call(preferences),call(preferences)]);for(const r of results){assert.equal(r.status,200);assert.equal(r.headers.etag,'"v1"');assert.deepEqual(r.body,{...input,version:1});assert.equal(r.headers['cache-control'],'no-store');}
    const empty=await call();assert.deepEqual(empty.body,{items:[],nextCursor:null,unreadCount:0});assert.equal((await db.query('SELECT * FROM notification_preferences')).rows.length,1);
  });
  let notices;
  await t.test('keyset pagination preserves microseconds and ties, count covers all owner unread, other owner excluded',async()=>{
    for(let i=0;i<12;i++)await accept(event());await accept(event(other));while(await worker.tick()){}
    notices=(await db.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY id',[owner])).rows;
    for(let i=0;i<notices.length;i++)await db.query('UPDATE notifications SET created_at=$2::timestamptz WHERE id=$1',[notices[i].id,'2026-11-08T12:00:00.'+String(i<3?1:i).padStart(6,'0')+'Z']);
    let cursor,all=[];do{const response=await call('/api/v1/notifications?limit=3'+(cursor?'&cursor='+cursor:''));assert.equal(response.status,200);assert.equal(response.body.unreadCount,12);all.push(...response.body.items.map(x=>x.id));cursor=response.body.nextCursor;assert.equal(response.text.includes('user_id'),false);}while(cursor);
    assert.equal(new Set(all).size,12);assert.equal(all.length,12);assert.deepEqual(new Set(all),new Set(notices.map(n=>n.id)));
  });
  await t.test('read is idempotent under concurrency, owner filtered including ADMIN and count updates',async()=>{
    const id=notices[0].id;for(const r of await Promise.all([call('/api/v1/notifications/'+id+'/read',{method:'PUT'}),call('/api/v1/notifications/'+id+'/read',{method:'PUT'})])){assert.equal(r.status,204);assert.equal(r.body,null);assert.equal(r.headers['cache-control'],'no-store');}
    const first=(await db.query('SELECT read_at FROM notifications WHERE id=$1',[id])).rows[0].read_at;await call('/api/v1/notifications/'+id+'/read',{method:'PUT',body:{}});assert.equal((await db.query('SELECT read_at FROM notifications WHERE id=$1',[id])).rows[0].read_at.toISOString(),first.toISOString());
    assert.equal((await call('/api/v1/notifications/'+id+'/read',{method:'PUT',actor:other,role:'ADMIN'})).status,404);
    const unread=await call('/api/v1/notifications?unreadOnly=true&limit=100');assert.equal(unread.body.items.length,11);assert.equal(unread.body.unreadCount,11);assert.equal((await call()).body.unreadCount,11);
  });
  await t.test('invalid/foreign/filter-scoped cursor, duplicate query and path/body are rejected',async()=>{
    const cursor=(await call('/api/v1/notifications?limit=1')).body.nextCursor;
    for(const path of ['?limit=0','?limit=101','?limit=01','?unreadOnly=yes','?unreadOnly=true&unreadOnly=false','?limit=1&limit=2','?owner='+owner,'?cursor=bad','?limit=2&cursor='+cursor,'?unreadOnly=true&limit=1&cursor='+cursor])assert.equal((await call('/api/v1/notifications'+path)).status,400,path);
    assert.equal((await call('/api/v1/notifications?limit=1&cursor='+cursor,{actor:other})).status,400);
    assert.equal((await call('/api/v1/notifications/bad/read',{method:'PUT'})).status,400);assert.equal((await call('/api/v1/notifications/'+notices[1].id+'/read',{method:'PUT',body:{owner}})).status,422);
  });
  await t.test('preferences require strong bounded ETag, exact body, lead range and unknown fields blocked',async()=>{
    assert.equal((await update(input)).status,428);for(const tag of ['W/"v1"','*','"v0"','"v2147483648"'])assert.equal((await update(input,tag)).status,400);
    for(const body of [{...input,userId:other},{...input,leadMinutes:4},{...input,leadMinutes:1441},{...input,leadMinutes:5.5},{leadMinutes:60}])assert.equal((await update(body,'"v1"')).status,422);
    assert.equal((await update(null,'"v1"')).status,400,'strict JSON parser rejects non-object request');
    assert.equal((await call(preferences,{method:'PUT',raw:'{bad',headers:{'if-match':'"v1"'}})).status,400);
  });
  await t.test('two writers with v1 yield one commit and one 412 without lost update or cross-owner changes',async()=>{
    const otherBefore=(await call(preferences,{actor:other})).body;const candidates=[{...input,leadMinutes:15},{...input,leadMinutes:90}];const results=await Promise.all(candidates.map(x=>update(x,'"v1"')));assert.deepEqual(results.map(x=>x.status).sort(),[200,412]);
    const winner=results.find(x=>x.status===200);assert.equal(winner.headers.etag,'"v2"');assert.deepEqual((await call(preferences)).body,winner.body);assert.deepEqual((await call(preferences,{actor:other})).body,otherBefore);
  });
  await t.test('API opt-out reschedules jobs atomically, keeps auth email, re-enable sends once',async()=>{
    const e=event();await accept(e);const before=await call(preferences);let r=await update({...input,reminderInAppEnabled:false},before.headers.etag);assert.equal(r.status,200);
    const jobs=(await db.query('SELECT * FROM delivery_jobs WHERE source_ref=$1',[e.aggregateId])).rows;assert.ok(jobs.every(j=>j.status==='CANCELED'));assert.equal(await worker.tick(),false);
    const ref=randomUUID(),authEvent={id:randomUUID(),type:'identity.email-action.requested.v1',producer:'identity',schemaVersion:1,aggregateId:ref,aggregateVersion:1,occurredAt:now().toISOString(),correlationId:randomUUID(),data:{deliveryRef:ref,purpose:'VERIFY_EMAIL',expiresAt:new Date(time.getTime()+86400000).toISOString()}};
    await new Inbox(db,now).accept(Buffer.from(JSON.stringify(authEvent)));let sent=0;await new DeliveryWorker(db,{resolve:async()=>({deliveryRef:ref,purpose:'VERIFY_EMAIL',recipient:'sandbox@example.test',actionUrl:'https://web.test/xac-minh-email#token='+'a'.repeat(43),expiresAt:authEvent.data.expiresAt})},{send:async()=>sent++},now).tick();assert.equal(sent,1);
    r=await update(input,r.headers.etag);assert.equal(r.status,200);assert.equal(await worker.tick(),true);assert.equal((await db.query('SELECT * FROM notifications WHERE occurrence_id=$1',[e.aggregateId])).rows.length,1);
  });
  await t.test('mTLS allowlist, JWT validity and verified role are enforced independently of headers',async()=>{
    assert.equal((await call(undefined,{cert:tls.clients.unknown})).status,403);assert.equal((await call(undefined,{headers:{authorization:''}})).status,401);assert.equal((await call(undefined,{bearer:token(owner,'USER',true)})).status,401);
    const validToken=token();const parts=validToken.split('.');parts[1]=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(parts[1],'base64url')),sub:other})).toString('base64url');assert.equal((await call(undefined,{bearer:parts.join('.')})).status,401);
    for(const [patch,status]of [[{emailVerified:false},403],[{roles:['ROOT']},401],[{aud:'wrong-audience'},401]]){
      const [h,p]=token().split('.'),payload=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(p,'base64url')), ...patch})).toString('base64url'),input=h+'.'+payload;
      const bearer=input+'.'+sign('RSA-SHA256',Buffer.from(input),pair.privateKey).toString('base64url');assert.equal((await call(undefined,{bearer})).status,status);
    }
    const foreignIds=new Set((await db.query('SELECT id FROM notifications WHERE user_id=$1',[other])).rows.map(n=>n.id));
    const spoofed=await call(undefined,{headers:{'x-user-id':other,'x-user-role':'ADMIN'}});assert.equal(spoofed.status,200);assert.ok(spoofed.body.items.length);assert.ok(spoofed.body.items.every(n=>!foreignIds.has(n.id)));
  });
  await t.test('API enablement requires valid BFF fingerprints and Identity issuer; worker-only config stays compatible',async()=>{
    const {loadConfig}=await import('../../backend/apps/notification/dist/config.js');const previous={...process.env};
    try{
      for(const [key,value]of Object.entries({NOTIFICATION_DATABASE_URL:urls.inbox_notification,NOTIFICATION_IDENTITY_ORIGIN:config.auth.identity.origin,NOTIFICATION_WEB_ORIGIN:'https://web.test',NOTIFICATION_AMQP_URL:'amqp://127.0.0.1:5672/test',NOTIFICATION_ALLOW_LOOPBACK_PLAINTEXT:'true',NOTIFICATION_PROBE_FINGERPRINTS:JSON.stringify(tls.callers.bff),SMTP_HOST:'127.0.0.1',SMTP_PORT:'2525',SMTP_FROM:'noreply@smartgym.test'}))process.env[key]=value;
      delete process.env.SMTP_USER;
      for(const prefix of ['NOTIFICATION_TLS','NOTIFICATION_IDENTITY'])for(const [key,file]of Object.entries({KEY:prefix==='NOTIFICATION_TLS'?'server.key':'notification.key',CERT:prefix==='NOTIFICATION_TLS'?'server.crt':'notification.crt',CA:'ca.crt'}))process.env[prefix+'_'+key+'_FILE']=join(tls.directory,file);
      process.env.NOTIFICATION_API_ENABLED='false';assert.equal((await loadConfig()).auth,undefined);
      process.env.NOTIFICATION_API_ENABLED='true';process.env.NOTIFICATION_BFF_FINGERPRINTS='[]';await assert.rejects(loadConfig());
      process.env.NOTIFICATION_BFF_FINGERPRINTS=JSON.stringify(tls.callers.bff);delete process.env.NOTIFICATION_IDENTITY_ISSUER;await assert.rejects(loadConfig());
      process.env.NOTIFICATION_IDENTITY_ISSUER='http://invalid.test';await assert.rejects(loadConfig());process.env.NOTIFICATION_IDENTITY_ISSUER='https://identity.test';assert.deepEqual((await loadConfig()).auth.bffFingerprints,tls.callers.bff);
    }finally{for(const key of Object.keys(process.env))if(!Object.hasOwn(previous,key))delete process.env[key];Object.assign(process.env,previous);}
  });
  await t.test('broker outage only affects ready; API disabled exposes no owner routes; DB errors are sanitized',async()=>{
    ready=false;assert.equal((await call('/health/ready')).status,503);assert.equal((await call('/health/live')).status,200);assert.equal((await call()).status,200);ready=true;
    const disabled=await createApp(db,{tls:config.tls,probeFingerprints:config.probeFingerprints},()=>true);await disabled.listen(0,'127.0.0.1');try{assert.equal((await call(undefined,{target:disabled.getHttpServer().address().port})).status,404);}finally{await disabled.close();}
    dbFailure=true;const failure=await call();dbFailure=false;assert.equal(failure.status,503);assert.equal(failure.body.code,'NOTIFICATION_UNAVAILABLE');assert.equal(failure.text.includes('password'),false);
  });
});
