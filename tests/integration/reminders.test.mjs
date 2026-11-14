import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,generateKeyPairSync,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {request} from 'node:https';
import {startPostgres,freePort} from '../helpers/postgres.mjs';
import {startRabbit} from '../helpers/rabbitmq.mjs';
import {startProcess} from '../helpers/processes.mjs';
import {createTestTls} from '../../backend/apps/identity/test/tls.cjs';
import {connectDatabase} from '../../backend/apps/notification/dist/database.js';
import {migrate} from '../../backend/apps/notification/dist/migrate.js';
import {ReminderInbox,ReminderWorker,ReminderPreferences} from '../../backend/apps/notification/dist/modules/inbox/reminders.js';
import {Inbox,DeliveryWorker,DeliveryError} from '../../backend/apps/notification/dist/modules/delivery/jobs.js';
import {IdentityClient} from '../../backend/apps/notification/dist/identity-client.js';
import {SmtpProvider} from '../../backend/apps/notification/dist/modules/delivery/mail.js';
import {WorkoutConsumer} from '../../backend/apps/notification/dist/broker.js';
import {migrate as migrateIdentity} from '../../backend/apps/identity/dist/migrate.js';
import {createApp as createIdentity} from '../../backend/apps/identity/dist/app.js';
import {IdentityKeys} from '../../backend/apps/identity/dist/modules/accounts/crypto.js';
import {migrate as migrateWorkout} from '../../backend/apps/workout/dist/migrate.js';
import {Schedules} from '../../backend/apps/workout/dist/modules/scheduling/schedules.service.js';
import {ConfirmPublisher} from '../../backend/apps/workout/dist/broker.js';
import {OutboxRelay} from '../../backend/apps/workout/dist/outbox.js';
import {provisionEmailTopology} from '../../scripts/provision-email-topology.mjs';
import {provisionReminderTopology} from '../../scripts/provision-reminder-topology.mjs';
const {SMTPServer,connect}=(()=>{const require=createRequire(new URL('../../backend/apps/notification/package.json',import.meta.url));return{SMTPServer:require('smtp-server').SMTPServer,connect:require('amqplib').connect};})();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let n=0;n<200;n++){if(await check())return;await delay(50);}throw new Error('Timed out: '+label);}

test('T19 Notification reminders on independent PostgreSQL/RabbitMQ/mTLS/SMTP', {timeout:180000},async t=>{
  const cleanup=[];t.after(async()=>{const errors=[];for(const close of cleanup.reverse())try{await close();}catch(e){errors.push(e);}if(errors.length)throw new AggregateError(errors,'Reminder cleanup');});
  const pg=await startPostgres();cleanup.push(pg.stop);const broker=await startRabbit({publisher:'workout',reminders:true});cleanup.push(broker.stop);t.diagnostic(pg.version+'; '+broker.version);
  await provisionEmailTopology(broker.url);await provisionReminderTopology(broker.url);await provisionReminderTopology(broker.url);
  const admin=connectDatabase(pg.connectionString),urls={};
  try{for(const name of ['reminder_identity','reminder_workout','reminder_notification']){
    const password=randomBytes(24).toString('hex');await admin.query("CREATE ROLE "+name+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '"+password+"'");
    await admin.query('CREATE DATABASE '+name+' OWNER '+name);await admin.query('REVOKE CONNECT ON DATABASE '+name+' FROM PUBLIC');
    const url=new URL(pg.connectionString);url.username=name;url.password=password;url.pathname='/'+name;urls[name]=url.href;
  }}finally{await admin.close();}
  const db=connectDatabase(urls.reminder_notification),identityDb=connectDatabase(urls.reminder_identity),workoutDb=connectDatabase(urls.reminder_workout);
  for(const database of [db,identityDb,workoutDb])cleanup.push(()=>database.close());
  let time=new Date('2026-11-08T12:00:00Z');const now=()=>new Date(time);
  // Explicit synthetic domain events are used for fault/reordering cases; the first chain uses real Workout logic/outbox.
  const event=(options={})=>{const id=options.occurrenceId??randomUUID();return{id:randomUUID(),type:'workout.occurrence.changed.v1',producer:'workout',schemaVersion:1,occurredAt:now().toISOString(),aggregateId:id,aggregateVersion:options.version??1,correlationId:randomUUID(),data:{occurrenceId:id,userId:options.owner??randomUUID(),status:options.status??'SCHEDULED',startAt:options.startAt??new Date(time.getTime()+30*60000).toISOString(),endAt:options.endAt??new Date(time.getTime()+90*60000).toISOString(),timeZone:options.timeZone??'Asia/Bangkok'}};};
  const old=await readFile('backend/apps/notification/migrations/001_email_delivery.sql','utf8');await db.query(old);
  await db.query('INSERT INTO notification_migrations(version,checksum) VALUES(1,$1)',[createHash('sha256').update(old).digest('hex')]);
  const securityId=randomUUID(),securityRef=randomUUID();
  await db.query(`INSERT INTO delivery_jobs(id,channel,purpose,source_ref,source_version,expires_at,due_at,status,provider_idempotency_key,created_at,updated_at)
    VALUES($1,'EMAIL','VERIFY_EMAIL',$2,1,$3,$4,'PENDING',$5,$4,$4)`,[securityId,securityRef,new Date(time.getTime()+86400000),now(),'<'+securityId+'@mail.smartgym.invalid>']);
  await migrate(db);await migrate(db);await migrateIdentity(identityDb);await migrateWorkout(workoutDb);
  const tls=await createTestTls();cleanup.push(tls.stop);
  const keys=new IdentityKeys(generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}),'reminders-test','https://identity.test',randomBytes(32),randomBytes(32));
  const {app:identity}=await createIdentity(identityDb,{keys,webOrigin:'https://web.test',callers:tls.callers,tls:{...tls.clients.server,ca:tls.ca}},now);
  await identity.listen(0,'127.0.0.1');cleanup.push(()=>identity.close());const identityOrigin='https://127.0.0.1:'+identity.getHttpServer().address().port;
  const contact=new IdentityClient(identityOrigin,{...tls.clients.notification,ca:tls.ca},'https://web.test');
  const activeUser=async(id,email='reminder@example.test')=>identityDb.query(`INSERT INTO users(id,email,email_normalized,display_name,status,email_verified_at,created_at,updated_at)
    VALUES($1,$2,$2,'Người tập','ACTIVE',$3,$3,$3)`,[id,email,now()]);
  let smtpMode='accept';const messages=[];
  const smtp=new SMTPServer({authOptional:true,disabledCommands:['AUTH','STARTTLS'],onData(stream,session,callback){let raw='';stream.setEncoding('utf8');stream.on('data',part=>raw+=part);stream.on('end',()=>{
    if(smtpMode==='hang'){setTimeout(()=>{const e=new Error('sandbox late reject');e.responseCode=451;callback(e);},6000);return;}
    if(smtpMode!=='accept'){const e=new Error('sandbox rejection');e.responseCode=smtpMode==='temporary'?451:550;callback(e);return;}
    messages.push({raw,to:session.envelope.rcptTo.map(v=>v.address)});callback(null,'sandbox-accepted');
  });}});smtp.on('error',()=>{});await new Promise(resolve=>smtp.listen(0,'127.0.0.1',resolve));cleanup.push(()=>new Promise(resolve=>{for(const connection of smtp.connections)connection.close();smtp.close(resolve);}));
  const mail=new SmtpProvider({host:'127.0.0.1',port:smtp.server.address().port,from:'noreply@smartgym.test',secure:false,allowLocal:true},'https://web.test');cleanup.push(()=>mail.close());
  const inbox=new ReminderInbox(db,now),pref=new ReminderPreferences(db,now),worker=new ReminderWorker(db,contact,mail,now);
  const accept=e=>inbox.accept(Buffer.from(JSON.stringify(e))),getJob=async(e,channel='IN_APP')=>(await db.query('SELECT * FROM delivery_jobs WHERE source_ref=$1 AND source_version=$2 AND channel=$3',[e.aggregateId,e.aggregateVersion,channel])).rows[0];
  const reset=async()=>{smtpMode='accept';for(const table of ['notifications','delivery_resolutions','delivery_attempts','delivery_jobs','occurrence_projection','notification_preferences','inbox_events'])await db.query('DELETE FROM '+table);};
  const emailOnly=async owner=>{const p=await pref.get(owner);return pref.update(owner,{reminderInAppEnabled:false,reminderEmailEnabled:true,leadMinutes:60},p.version);};
  const consumer=new WorkoutConsumer(inbox);cleanup.push(()=>consumer.close());await consumer.start(broker.consumerUrl,true);
  const publisher=await ConfirmPublisher.open(broker.publisherUrl,undefined,true);cleanup.push(()=>publisher.close());
  const adminBroker=await connect(broker.url);adminBroker.on('error',()=>{});cleanup.push(()=>adminBroker.close());const channel=await adminBroker.createChannel();channel.on('error',()=>{});
  await t.test('migration preserves security job; auth worker never claims a reminder and ignores opt-out',async()=>{
    assert.equal((await db.query('SELECT * FROM delivery_jobs WHERE id=$1',[securityId])).rows[0].source_ref,securityRef);
    const e=event();await accept(e);await pref.update(e.data.userId,{reminderInAppEnabled:false,reminderEmailEnabled:false,leadMinutes:60},1);
    let sent=0;const auth=new DeliveryWorker(db,{resolve:async()=>({deliveryRef:securityRef,purpose:'VERIFY_EMAIL',recipient:'auth@example.test',actionUrl:'https://web.test/xac-minh-email#token='+'a'.repeat(43),expiresAt:new Date(time.getTime()+86400000).toISOString()})},{send:async()=>sent++},now);
    assert.equal(await auth.tick(),true);assert.equal(await auth.tick(),false);assert.equal(sent,1);
    assert.equal((await db.query('SELECT status FROM delivery_jobs WHERE id=$1',[securityId])).rows[0].status,'SENT');await reset();
  });
  await t.test('real Workout schedule/outbox → broker → durable projection → current Identity contact → SMTP and inbox',async()=>{
    const owner=randomUUID(),planId=randomUUID();await activeUser(owner);await emailOnly(owner);
    await workoutDb.query('INSERT INTO workout_plans(id,owner_user_id,title) VALUES($1,$2,$3)',[planId,owner,'Nhắc lịch thử nghiệm']);
    await workoutDb.query('INSERT INTO workout_plan_items(id,plan_id,sort_order,exercise_id,title_snapshot,target_sets,target_reps) VALUES($1,$2,0,$3,$4,3,10)',[randomUUID(),planId,'bodyweight_squat','Squat']);
    await new Schedules(workoutDb,now).create(owner,randomUUID(),{planId,timeZone:'Asia/Bangkok',startDate:'2026-11-08',startLocalTime:'19:30',durationMinutes:60,recurrence:'ONCE'});
    // Outbox availability uses the database wall clock, independent of the reminder fixture clock.
    const relay=new OutboxRelay(workoutDb,publisher);assert.equal(await relay.tick(),true);
    const row=(await workoutDb.query('SELECT payload FROM outbox_events ORDER BY occurred_at DESC LIMIT 1')).rows[0],e=row.payload;
    await until(async()=>!!await getJob(e,'EMAIL'),'projection committed');
    await identityDb.query("UPDATE users SET email='updated@example.test',email_normalized='updated@example.test' WHERE id=$1",[owner]);
    const before=messages.length;await worker.tick();assert.equal(messages.length,before+1);assert.deepEqual(messages.at(-1).to,['updated@example.test']);
    const text=Buffer.from(messages.at(-1).raw.split('\r\n\r\n').slice(1).join('\r\n\r\n').replaceAll('\r\n',''),'base64').toString('utf8');
    assert.ok(text.includes('https://web.test/app/lich/buoi/'+e.aggregateId));assert.ok(text.includes('Asia/Bangkok'));assert.equal((await getJob(e,'EMAIL')).status,'SENT');
    await pref.update(owner,{reminderInAppEnabled:true,reminderEmailEnabled:true,leadMinutes:60},2);await worker.tick();assert.equal((await db.query('SELECT * FROM notifications WHERE user_id=$1',[owner])).rows.length,1);
    const stored=JSON.stringify((await db.query('SELECT * FROM delivery_jobs')).rows);assert.equal(stored.includes('@example.test'),false);
    const forbidden=new URL(urls.reminder_notification);forbidden.pathname='/reminder_workout';const cross=connectDatabase(forbidden.href);try{await assert.rejects(cross.query('SELECT 1'));}finally{await cross.close();}
    await reset();
  });
  await t.test('event duplicates/concurrency/hash reuse and same version conflict',async()=>{
    const e=event();await Promise.all([accept(e),accept(e)]);await accept(Object.fromEntries(Object.entries(e).reverse()));await accept({...e,id:randomUUID()});
    assert.equal((await db.query('SELECT * FROM delivery_jobs')).rows.length,2);assert.equal((await db.query('SELECT * FROM inbox_events')).rows.length,2);
    await assert.rejects(accept({...e,data:{...e.data,timeZone:'UTC'}}),/reused/);
    await assert.rejects(accept({...e,id:randomUUID(),data:{...e.data,timeZone:'UTC'}}),/Conflicting/);
    await assert.rejects(accept({...e,id:randomUUID(),aggregateVersion:2,data:{...e.data,userId:randomUUID()}}),/owner/);await reset();
  });
  await t.test('newest version wins; cancel tombstone survives old event; move invalidates old due job',async()=>{
    const e=event();await accept(e);const later=event({occurrenceId:e.aggregateId,owner:e.data.userId,version:2,startAt:new Date(time.getTime()+3*3600000).toISOString(),endAt:new Date(time.getTime()+4*3600000).toISOString()});await accept(later);
    assert.equal((await getJob(e)).status,'CANCELED');assert.equal(await worker.tick(),false);
    const canceled={...later,id:randomUUID(),aggregateVersion:3,data:{...later.data,status:'CANCELED'}};await accept(canceled);await accept({...e,id:randomUUID()});
    assert.equal((await db.query('SELECT version,status FROM occurrence_projection')).rows[0].version,3);assert.equal(await worker.tick(),false);
    const tomb=event({status:'CANCELED',version:8});await accept(tomb);await accept({...tomb,id:randomUUID(),aggregateVersion:1,data:{...tomb.data,status:'SCHEDULED'}});assert.equal((await getJob(tomb)).status,'CANCELED');await reset();
  });
  await t.test('invalid schema/zone/interval/oversize reject and transaction failure rolls back inbox/projection/jobs',async()=>{
    const e=event();for(const invalid of [{...e,aggregateId:randomUUID()},{...e,data:{...e.data,timeZone:'Bad/Zone'}},{...e,data:{...e.data,endAt:e.data.startAt}},{...e,data:{...e.data,startAt:'2026-12-31T23:59:60Z'}},{...e,data:{...e.data,email:'secret@example.test'}}])await assert.rejects(accept(invalid));
    await assert.rejects(inbox.accept(Buffer.alloc(17000)));await assert.rejects(inbox.accept(Buffer.from('null')));
    const failing={...db,transaction:fn=>db.transaction(c=>fn({query:(sql,values)=>{if(sql.includes('INSERT INTO delivery_jobs'))throw Error('Injected reminder DB failure');return c.query(sql,values);}}))};
    await assert.rejects(new ReminderInbox(failing,now).accept(Buffer.from(JSON.stringify(e))));
    for(const table of ['inbox_events','occurrence_projection','delivery_jobs','notification_preferences'])assert.equal((await db.query('SELECT * FROM '+table)).rows.length,0);
    await accept(e);assert.ok(await getJob(e));await reset();
  });
  await t.test('two workers create one in-app notification atomically, no Identity/SMTP dependency',async()=>{
    const e=event();await accept(e);const unavailable={contact:async()=>{throw Error('must not call Identity');}},noMail={sendReminder:async()=>{throw Error('must not send email');}};
    await Promise.all([new ReminderWorker(db,unavailable,noMail,now).tick(),new ReminderWorker(db,unavailable,noMail,now).tick()]);
    assert.equal((await getJob(e)).status,'SENT');assert.equal((await db.query('SELECT * FROM notifications')).rows.length,1);assert.equal((await getJob(e,'EMAIL')).status,'CANCELED');await reset();
  });
  await t.test('in-app insert failure leaves no notification/SENT and retries once after recovery',async()=>{
    const e=event();await accept(e);let fail=true;
    const failing={...db,transaction:fn=>db.transaction(c=>fn({query:(sql,values)=>{if(fail&&sql.includes('INSERT INTO notifications'))throw Error('Injected inbox failure');return c.query(sql,values);}}))};
    await new ReminderWorker(failing,contact,mail,now).tick();assert.equal((await getJob(e)).status,'RETRY');assert.equal((await db.query('SELECT * FROM notifications')).rows.length,0);
    fail=false;time=new Date(time.getTime()+5000);await worker.tick();assert.equal((await getJob(e)).status,'SENT');assert.equal((await db.query('SELECT * FROM notifications')).rows.length,1);await reset();
  });
  await t.test('preference lead shifts due, opt-out cancels, re-enable does not resend SENT, stale version rejects',async()=>{
    const e=event();await accept(e);await pref.update(e.data.userId,{reminderInAppEnabled:true,reminderEmailEnabled:false,leadMinutes:5},1);assert.equal(await worker.tick(),false);
    await assert.rejects(pref.update(e.data.userId,{reminderInAppEnabled:false,reminderEmailEnabled:false,leadMinutes:5},1),/VERSION_CONFLICT/);
    await pref.update(e.data.userId,{reminderInAppEnabled:false,reminderEmailEnabled:false,leadMinutes:60},2);assert.equal((await getJob(e)).status,'CANCELED');
    await pref.update(e.data.userId,{reminderInAppEnabled:true,reminderEmailEnabled:false,leadMinutes:60},3);await worker.tick();
    await pref.update(e.data.userId,{reminderInAppEnabled:false,reminderEmailEnabled:false,leadMinutes:60},4);await pref.update(e.data.userId,{reminderInAppEnabled:true,reminderEmailEnabled:false,leadMinutes:60},5);
    assert.equal(await worker.tick(),false);assert.equal((await db.query('SELECT * FROM notifications')).rows.length,1);await reset();
  });
  await t.test('cancel and opt-out during Identity resolution fence the claimed email',async()=>{
    for(const action of ['cancel','optout']){
      const e=event();await activeUser(e.data.userId,e.data.userId+'@example.test');await emailOnly(e.data.userId);await accept(e);
      let release,started;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);let sends=0;
      const slow=new ReminderWorker(db,{contact:async owner=>{started();await gate;return contact.contact(owner);}},{sendReminder:async()=>sends++},now);
      const pending=slow.tick();await ready;
      if(action==='cancel')await accept({...e,id:randomUUID(),aggregateVersion:2,data:{...e.data,status:'CANCELED'}});
      else await pref.update(e.data.userId,{reminderInAppEnabled:false,reminderEmailEnabled:false,leadMinutes:60},2);
      release();await pending;assert.equal(sends,0);assert.equal((await getJob(e,'EMAIL')).status,'CANCELED');
      assert.equal((await db.query('SELECT outcome FROM delivery_attempts')).rows[0].outcome,'CANCELED');await reset();
    }
  });
  await t.test('retry budget/temporary and permanent SMTP failures; no contact cancels',async()=>{
    let e=event();await activeUser(e.data.userId,e.data.userId+'@example.test');await emailOnly(e.data.userId);await accept(e);
    smtpMode='temporary';await worker.tick();assert.equal((await getJob(e,'EMAIL')).status,'RETRY');assert.equal(await worker.tick(),false);
    time=new Date(time.getTime()+5000);smtpMode='accept';await worker.tick();assert.equal((await getJob(e,'EMAIL')).status,'SENT');await reset();
    e=event();await activeUser(e.data.userId,e.data.userId+'@example.test');await emailOnly(e.data.userId);await accept(e);smtpMode='permanent';await worker.tick();assert.equal((await getJob(e,'EMAIL')).status,'FAILED');await reset();
    e=event();await emailOnly(e.data.userId);await accept(e);await worker.tick();assert.equal((await getJob(e,'EMAIL')).status,'CANCELED');await reset();
    e=event({startAt:new Date(time.getTime()+2*3600000).toISOString(),endAt:new Date(time.getTime()+3*3600000).toISOString()});
    await emailOnly(e.data.userId);await pref.update(e.data.userId,{reminderInAppEnabled:false,reminderEmailEnabled:true,leadMinutes:1440},2);
    await accept(e);const offline=new ReminderWorker(db,{contact:async()=>{throw new DeliveryError('RETRY','IDENTITY_UNAVAILABLE');}},mail,now);
    for(let n=0;n<5;n++){await offline.tick();time=new Date(time.getTime()+600001);}assert.equal((await getJob(e,'EMAIL')).attempts,5);assert.equal((await getJob(e,'EMAIL')).status,'FAILED');await reset();
  });
  await t.test('expired/late occurrence never sends; due time uses instant through DST offsets',async()=>{
    const e=event({startAt:new Date(time.getTime()-60000).toISOString()});await accept(e);assert.equal(await worker.tick(),false);assert.equal((await getJob(e)).status,'CANCELED');
    const dst=event({startAt:'2026-11-09T01:30:00-05:00',endAt:'2026-11-09T02:30:00-05:00',timeZone:'America/New_York'});await accept(dst);assert.equal(new Date((await getJob(dst)).due_at).toISOString(),'2026-11-09T05:30:00.000Z');await reset();
  });
  await t.test('SMTP ambiguous acceptance becomes UNKNOWN and operator must reconcile before retry',async()=>{
    const e=event();await activeUser(e.data.userId,e.data.userId+'@example.test');await emailOnly(e.data.userId);await accept(e);smtpMode='hang';await worker.tick();assert.equal((await getJob(e,'EMAIL')).status,'UNKNOWN');assert.equal(await worker.tick(),false);
    const resolver=new DeliveryWorker(db,{},{} ,now);await resolver.resolveUnknown((await getJob(e,'EMAIL')).id,'CONFIRMED_NOT_SENT','OP-test','CASE-not-accepted');smtpMode='accept';await worker.tick();assert.equal((await getJob(e,'EMAIL')).status,'SENT');await reset();
  });
  await t.test('lost claim recovers safely, expired SENDING remains UNKNOWN and stale worker cannot send',async()=>{
    const e=event();await emailOnly(e.data.userId);await accept(e);let release,started;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);let sends=0;
    const slow=new ReminderWorker(db,{contact:async()=>{started();await gate;return{userId:e.data.userId,email:'test@example.test',emailVerified:true,timeZone:'UTC'};}},{sendReminder:async()=>sends++},now);
    const pending=slow.tick();await ready;time=new Date(time.getTime()+61000);await worker.recover();assert.equal((await getJob(e,'EMAIL')).status,'RETRY');release();await pending;assert.equal(sends,0);
    const job=await getJob(e,'EMAIL');await db.query("UPDATE delivery_jobs SET status='SENDING',lease_token=$2,lease_until=$3 WHERE id=$1",[job.id,randomUUID(),new Date(time.getTime()-1)]);await worker.recover();assert.equal((await getJob(e,'EMAIL')).status,'UNKNOWN');await reset();
  });
  await t.test('two email workers send once; cancellation after dispatch keeps the accepted history',async()=>{
    const e=event();await emailOnly(e.data.userId);await accept(e);let release,started,sends=0;
    const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r),client={contact:async()=>({userId:e.data.userId,email:'sandbox@example.test',emailVerified:true,timeZone:'UTC'})};
    const a=new ReminderWorker(db,client,{sendReminder:async()=>{sends++;started();await gate;}},now);
    const b=new ReminderWorker(db,client,{sendReminder:async()=>sends++},now);
    const pending=a.tick();await ready;assert.equal((await getJob(e,'EMAIL')).status,'SENDING');assert.equal(await b.tick(),false);
    await accept({...e,id:randomUUID(),aggregateVersion:2,data:{...e.data,status:'CANCELED'}});release();await pending;
    assert.equal(sends,1);assert.equal((await getJob(e,'EMAIL')).status,'SENT');assert.equal((await db.query('SELECT status FROM occurrence_projection')).rows[0].status,'CANCELED');await reset();
  });
  await t.test('SMTP accepted then result write fails becomes UNKNOWN; no automatic repeat',async()=>{
    const e=event();await emailOnly(e.data.userId);await accept(e);let fail=true,sends=0;
    const failing={...db,transaction:fn=>db.transaction(c=>fn({query:(sql,values)=>{
      if(fail&&sql.includes('provider_ref=$7')&&values?.[2]==='SENT'){fail=false;throw Error('Injected result commit failure');}return c.query(sql,values);
    }}))};
    const current=new ReminderWorker(failing,{contact:async()=>({userId:e.data.userId,email:'sandbox@example.test',emailVerified:true,timeZone:'UTC'})},{sendReminder:async()=>sends++},now);
    await current.tick();assert.equal((await getJob(e,'EMAIL')).status,'UNKNOWN');assert.equal(await current.tick(),false);assert.equal(sends,1);await reset();
  });
  await t.test('broker poison → DLQ; transient database failure leaves message for reconnect; runtime ACL denies publish/DLQ',async()=>{
    const invalid=event();await publisher.publish({...invalid,data:{...invalid.data,status:'INVALID'}});
    await until(async()=>!!(await channel.checkQueue('smartgym.notification.workout.dlq.v1')).messageCount,'poison DLQ');
    await consumer.close();let fail=true;const flaky=new WorkoutConsumer({accept:async buffer=>{if(fail)throw Error('Injected DB outage');await inbox.accept(buffer);}});cleanup.push(()=>flaky.close());await flaky.start(broker.consumerUrl,true);
    const e=event();await publisher.publish(e);await until(()=>!flaky.ready,'consumer close without ACK');fail=false;await flaky.start(broker.consumerUrl,true);await until(async()=>!!await getJob(e),'redelivery after DB recovery');await flaky.close();
    const connection=await connect(broker.consumerUrl);connection.on('error',()=>{});try{const ch=await connection.createConfirmChannel();ch.on('error',()=>{});await assert.rejects(new Promise((resolve,reject)=>{ch.once('close',()=>reject(Error('Denied')));ch.publish('smartgym.events.v1','workout.occurrence.changed.v1',Buffer.from('{}'),{},err=>err?reject(err):resolve());}));const other=await connection.createChannel();other.on('error',()=>{});await assert.rejects(other.get('smartgym.notification.workout.dlq.v1'));}finally{await connection.close();}await reset();
  });
  await t.test('standalone Notification process starts with both consumers and produces durable in-app; health mTLS',async()=>{
    const persisted=event({startAt:new Date(Date.now()+20*60000).toISOString(),endAt:new Date(Date.now()+80*60000).toISOString()});
    await new ReminderInbox(db).accept(Buffer.from(JSON.stringify(persisted)));
    assert.equal((await getJob(persisted)).status,'PENDING','durable due job exists before worker process startup');
    const port=await freePort();const process=startProcess(['dist/main.js'],'backend/apps/notification',{
      NOTIFICATION_DATABASE_URL:urls.reminder_notification,HOST:'127.0.0.1',PORT:String(port),NOTIFICATION_AMQP_URL:broker.consumerUrl,
      NOTIFICATION_ALLOW_LOOPBACK_PLAINTEXT:'true',NOTIFICATION_IDENTITY_ORIGIN:identityOrigin,NOTIFICATION_WEB_ORIGIN:'https://web.test',
      NOTIFICATION_IDENTITY_KEY_FILE:join(tls.directory,'notification.key'),NOTIFICATION_IDENTITY_CERT_FILE:join(tls.directory,'notification.crt'),NOTIFICATION_IDENTITY_CA_FILE:join(tls.directory,'ca.crt'),
      NOTIFICATION_TLS_KEY_FILE:join(tls.directory,'server.key'),NOTIFICATION_TLS_CERT_FILE:join(tls.directory,'server.crt'),NOTIFICATION_TLS_CA_FILE:join(tls.directory,'ca.crt'),
      NOTIFICATION_PROBE_FINGERPRINTS:JSON.stringify(tls.callers.bff),SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.server.address().port),SMTP_SECURE:'false',SMTP_FROM:'noreply@smartgym.test'
    });cleanup.push(()=>process.stop());
    const probe=(client=tls.clients.bff)=>new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port,path:'/health/ready',...client,ca:tls.ca,agent:false},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});
    await until(async()=>{try{return await probe()===200;}catch{return false;}},'standalone ready');assert.equal(await probe(tls.clients.unknown),403);
    await until(async()=>(await db.query('SELECT * FROM notifications WHERE occurrence_id=$1',[persisted.aggregateId])).rows.length===1,'persisted due job recovered on startup');
    const e=event({startAt:new Date(Date.now()+20*60000).toISOString(),endAt:new Date(Date.now()+80*60000).toISOString()});await publisher.publish(e);
    await until(async()=>(await db.query('SELECT * FROM notifications WHERE occurrence_id=$1',[e.aggregateId])).rows.length===1,'standalone durable reminder');await process.stop();
  });
});
