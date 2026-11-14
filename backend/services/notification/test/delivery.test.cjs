const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');const {SMTPServer}=require('smtp-server');
test('Notification inbox, delivery safety and SMTP sandbox', {timeout:60000},async t=>{
  const {migrate}=await import('../dist/migrate.js'),{Inbox,DeliveryWorker,DeliveryError}=await import('../dist/modules/delivery/jobs.js');
  const {SmtpProvider}=await import('../dist/modules/delivery/mail.js');const {parseEvent}=await import('../dist/contracts.js');
  const network=process.env.NOTIFICATION_TEST_DATABASE_URL?(await import('../dist/database.js')).connectDatabase(process.env.NOTIFICATION_TEST_DATABASE_URL):null;
  const pg=network??new PGlite();let failInsert=false;
  const wrap=client=>({query:async(sql,values)=>{if(failInsert&&sql.includes('INSERT INTO delivery_jobs'))throw new Error('Injected DB failure');if(!network&&!values)return(await client.exec(sql)).at(-1)??{rows:[]};return client.query(sql,values);}});
  const db={query:(...args)=>pg.query(...args),transaction:action=>network?network.transaction(client=>action(wrap(client))):pg.transaction(client=>action(wrap(client))),close:()=>pg.close()};
  t.after(()=>db.close());await migrate(db);await migrate(db);
  let time=new Date('2026-11-07T12:00:00Z');const now=()=>new Date(time),inbox=new Inbox(db,now);
  const envelope=(ref=randomUUID(),purpose='VERIFY_EMAIL')=>({id:randomUUID(),type:'identity.email-action.requested.v1',producer:'identity',schemaVersion:1,aggregateId:ref,aggregateVersion:1,occurredAt:now().toISOString(),correlationId:randomUUID(),data:{deliveryRef:ref,purpose,expiresAt:new Date(time.getTime()+86400000).toISOString()}});
  const accept=event=>inbox.accept(Buffer.from(JSON.stringify(event)));
  const delivery=job=>({deliveryRef:job.source_ref,purpose:job.purpose,recipient:'user@example.test',actionUrl:'https://web.test/xac-minh-email#token='+'a'.repeat(43),expiresAt:new Date(job.expires_at).toISOString()});
  const seed=async()=>{const event=envelope();await accept(event);return(await db.query('SELECT * FROM delivery_jobs WHERE source_ref=$1',[event.data.deliveryRef])).rows[0];};
  const reset=async()=>{for(const table of ['delivery_resolutions','delivery_attempts','delivery_jobs','inbox_events'])await db.query('DELETE FROM '+table);};
  const get=async id=>(await db.query('SELECT * FROM delivery_jobs WHERE id=$1',[id])).rows[0];
  let smtpMode='accept';const messages=[];
  const server=new SMTPServer({authOptional:true,disabledCommands:['AUTH','STARTTLS'],onData(stream,session,callback){let text='';stream.setEncoding('utf8');stream.on('data',chunk=>text+=chunk);stream.on('end',()=>{
    if(smtpMode==='hang'){setTimeout(()=>{const error=new Error('Late sandbox rejection');error.responseCode=451;callback(error);},6000);return;}
    if(smtpMode!=='accept'){const error=new Error('Sandbox rejection');error.responseCode=smtpMode==='temporary'?451:550;callback(error);return;}
    messages.push(text);callback(null,'sandbox-accepted');
  });}});server.on('error',()=>{});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{for(const connection of server.connections)connection.close();server.close(resolve);}));
  const mail=new SmtpProvider({host:'127.0.0.1',port:server.server.address().port,from:'noreply@smartgym.test',secure:false,allowLocal:true});t.after(()=>mail.close());
  await t.test('reject malformed/oversized/inconsistent events without persistence',async()=>{
    await assert.rejects(inbox.accept(Buffer.from('{bad')));await assert.rejects(inbox.accept(Buffer.alloc(17000)));
    const event=envelope();event.aggregateId=randomUUID();assert.throws(()=>parseEvent(Buffer.from(JSON.stringify(event))));
    event.aggregateId=event.data.deliveryRef;event.data.token='secret';await assert.rejects(accept(event));assert.equal((await db.query('SELECT * FROM inbox_events')).rows.length,0);
  });
  await t.test('duplicate/concurrent replay creates one logical job, detects altered payload',async()=>{
    const event=envelope();await Promise.all([accept(event),accept(event)]);
    const reordered=Object.fromEntries(Object.entries(event).reverse());await accept(reordered);
    await accept({...event,id:randomUUID()});assert.equal((await db.query('SELECT * FROM delivery_jobs')).rows.length,1);
    await assert.rejects(accept({...event,data:{...event.data,purpose:'RESET_PASSWORD'}}),/reused/);
    await assert.rejects(accept({...event,id:randomUUID(),data:{...event.data,purpose:'RESET_PASSWORD'}}),/Conflicting/);
    assert.equal((await db.query('SELECT * FROM inbox_events')).rows.length,2);
  });
  await t.test('inbox and job commit atomically when database fails',async()=>{
    const event=envelope();failInsert=true;await assert.rejects(accept(event));failInsert=false;
    assert.equal((await db.query('SELECT * FROM inbox_events WHERE event_id=$1',[event.id])).rows.length,0);await accept(event);
  });
  await t.test('two workers claim one job; successful SMTP sends Vietnamese text and persists no secret',async()=>{
    await reset();const job=await seed();const identity={resolve:async()=>delivery(job)};
    const workers=[new DeliveryWorker(db,identity,mail,now),new DeliveryWorker(db,identity,mail,now)];
    const before=messages.length;await Promise.all(workers.map(worker=>worker.tick()));assert.equal(messages.length,before+1);assert.equal((await get(job.id)).status,'SENT');
    const text=Buffer.from(messages.at(-1).split('\r\n\r\n').slice(1).join('\r\n\r\n').replaceAll('\r\n',''),'base64').toString('utf8');
    assert.match(text,/Xác nhận địa chỉ email/);assert.ok(text.includes(delivery(job).actionUrl));
    const stored=JSON.stringify((await db.query('SELECT * FROM delivery_jobs')).rows)+JSON.stringify((await db.query('SELECT * FROM delivery_attempts')).rows);
    assert.equal(stored.includes('user@example.test'),false);assert.equal(stored.includes('token='),false);
    await workers[0].tick();assert.equal(messages.length,before+1);
  });
  await t.test('SMTP 451 retries within budget, 550 fails without retry',async()=>{
    await reset();let job=await seed();const worker=new DeliveryWorker(db,{resolve:async ref=>delivery((await db.query('SELECT * FROM delivery_jobs WHERE source_ref=$1',[ref])).rows[0])},mail,now);
    smtpMode='temporary';await worker.tick();assert.equal((await get(job.id)).status,'RETRY');assert.equal((await get(job.id)).attempts,1);
    assert.equal(await worker.tick(),false);time=new Date(time.getTime()+5000);smtpMode='accept';await worker.tick();assert.equal((await get(job.id)).status,'SENT');
    job=await seed();smtpMode='permanent';await worker.tick();assert.equal((await get(job.id)).status,'FAILED');smtpMode='accept';
  });
  await t.test('SMTP ambiguous timeout becomes UNKNOWN and cannot auto replay',async()=>{
    await reset();const job=await seed(),worker=new DeliveryWorker(db,{resolve:async()=>delivery(job)},mail,now);smtpMode='hang';
    await worker.tick();assert.equal((await get(job.id)).status,'UNKNOWN');assert.equal(await worker.tick(),false);smtpMode='accept';
    await assert.rejects(worker.resolveUnknown(job.id,'CONFIRMED_NOT_SENT','user@example.test','CASE-1'));
    await worker.resolveUnknown(job.id,'CONFIRMED_NOT_SENT','OP-operator','CASE-sandbox-not-accepted');await worker.tick();assert.equal((await get(job.id)).status,'SENT');
    assert.equal((await db.query('SELECT * FROM delivery_resolutions')).rows.length,1);
  });
  await t.test('reclaim before send is safe; crash after send enters UNKNOWN',async()=>{
    await reset();const first=await seed(),second=await seed(),worker=new DeliveryWorker(db,{resolve:async()=>delivery(first)},mail,now);
    for(const[job,status]of[[first,'CLAIMED'],[second,'SENDING']]){
      await db.query('UPDATE delivery_jobs SET status=$2,attempts=1,lease_token=$3,lease_until=$4 WHERE id=$1',[job.id,status,randomUUID(),new Date(time.getTime()-1)]);
      await db.query('INSERT INTO delivery_attempts(id,delivery_job_id,attempt_no,at,outcome) VALUES($1,$2,1,$3,$4)',[randomUUID(),job.id,now(),status]);
    }
    await worker.recover();assert.equal((await get(first.id)).status,'RETRY');assert.equal((await get(second.id)).status,'UNKNOWN');
    await worker.resolveUnknown(second.id,'CONFIRMED_SENT','OP-operator','CASE-provider-accepted');assert.equal((await get(second.id)).status,'SENT');
  });
  await t.test('expired and revoked delivery never sends; bounded retry stops at attempt five',async()=>{
    await reset();let job=await seed(),worker=new DeliveryWorker(db,{resolve:async()=>{throw new DeliveryError('CANCELED','ACTION_EXPIRED');}},mail,now);
    await worker.tick();assert.equal((await get(job.id)).status,'CANCELED');
    job=await seed();await db.query('UPDATE delivery_jobs SET expires_at=$2 WHERE id=$1',[job.id,new Date(time.getTime()-1)]);assert.equal(await worker.tick(),false);assert.equal((await get(job.id)).status,'CANCELED');
    job=await seed();worker=new DeliveryWorker(db,{resolve:async()=>{throw new DeliveryError('RETRY','IDENTITY_UNAVAILABLE');}},mail,now);
    for(let i=0;i<5;i++){await worker.tick();time=new Date(time.getTime()+600001);}assert.equal((await get(job.id)).status,'FAILED');assert.equal((await get(job.id)).attempts,5);
  });
  await t.test('stale worker cannot send after another worker reclaims its lease',async()=>{
    await reset();const job=await seed();let release,started;
    const ready=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);let sends=0;
    const stale=new DeliveryWorker(db,{resolve:async()=>{started();await gate;return delivery(job);}},{send:async()=>sends++},now);
    const pending=stale.tick();await ready;time=new Date(time.getTime()+61000);
    const fresh=new DeliveryWorker(db,{resolve:async()=>delivery(job)},{send:async()=>sends++},now);await fresh.tick();release();await pending;
    assert.equal(sends,1);assert.equal((await get(job.id)).status,'SENT');
  });
  await t.test('migration checksum and transport safety reject unsafe configuration',async()=>{
    const checksum=(await db.query('SELECT checksum FROM notification_migrations WHERE version=1')).rows[0].checksum;
    await db.query('UPDATE notification_migrations SET checksum=$1 WHERE version=1',['changed']);await assert.rejects(migrate(db),/checksum/);
    await db.query('UPDATE notification_migrations SET checksum=$1 WHERE version=1',[checksum]);await migrate(db);
    const {brokerUrl}=await import('../dist/broker.js');assert.throws(()=>brokerUrl('amqp://example.com',true));assert.throws(()=>brokerUrl('amqp://127.0.0.1',false));
  });
});
