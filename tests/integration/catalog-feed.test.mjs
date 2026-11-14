import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID,randomBytes,generateKeyPairSync,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';import {request} from 'node:https';import {createRequire} from 'node:module';
import {startPostgres,freePort} from '../helpers/postgres.mjs';import {startRabbit} from '../helpers/rabbitmq.mjs';import {startProcess} from '../helpers/processes.mjs';
import {createTestTls} from '../../backend/services/identity/test/tls.cjs';import {createApp as createIdentity} from '../../backend/services/identity/dist/app.js';import {IdentityKeys} from '../../backend/services/identity/dist/modules/accounts/crypto.js';
import {connectDatabase} from '../../backend/services/catalog/dist/database.js';import {migrate} from '../../backend/services/catalog/dist/migrate.js';import {importSnapshot} from '../../backend/services/catalog/dist/import.js';
import {createAdminApp} from '../../backend/services/catalog/dist/admin-app.js';import {AdminCatalog} from '../../backend/services/catalog/dist/modules/exercises/admin-catalog.js';import {fingerprint} from '../../backend/services/catalog/dist/modules/admin/admin-store.js';
import {CatalogFeed} from '../../backend/services/catalog/dist/modules/feed/feed.js';import {validFeed,validCatalogEvent} from '../../backend/services/catalog/dist/modules/feed/feed-contract.js';
import {ConfirmPublisher,validateBrokerUrl} from '../../backend/services/catalog/dist/broker.js';import {OutboxRelay} from '../../backend/services/catalog/dist/modules/feed/outbox.js';import {provisionCatalogTopology} from '../../scripts/provision-catalog-topology.mjs';
const {connect}=createRequire(new URL('../../backend/services/catalog/package.json',import.meta.url))('amqplib');
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<200;i++){if(await fn())return;await delay(50);}throw Error('Timed out: '+label);}
test('T36 Catalog producer: mTLS head/snapshot and confirmed outbox; broker probe is NOT a RAG consumer',{timeout:180000},async t=>{
  const cleanup=[];t.after(async()=>{const failures=[];for(const close of cleanup.reverse())try{await close();}catch(e){failures.push(e);}if(failures.length)throw new AggregateError(failures,'Feed cleanup failed');});
  const pg=await startPostgres();cleanup.push(pg.stop);const admin=connectDatabase(pg.connectionString),password=randomBytes(24).toString('hex');
  try{await admin.query("CREATE ROLE catalog_feed_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '"+password+"'");await admin.query('CREATE DATABASE catalog_feed_test OWNER catalog_feed_test');await admin.query('REVOKE CONNECT ON DATABASE postgres FROM PUBLIC');await admin.query('REVOKE CONNECT ON DATABASE catalog_feed_test FROM PUBLIC');}finally{await admin.close();}
  const url=new URL(pg.connectionString);url.username='catalog_feed_test';url.password=password;url.pathname='/catalog_feed_test';const db=connectDatabase(url.href);cleanup.push(()=>db.close());await migrate(db);await migrate(db);
  const tls=await createTestTls();cleanup.push(tls.stop);const keys=new IdentityKeys(generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}),'feed-test','https://identity.test',randomBytes(32),randomBytes(32));
  const noBusiness={query:async()=>{throw Error('JWKS fixture must not query business tables');},transaction:async()=>{throw Error();},close:async()=>{}};
  const {app:identity}=await createIdentity(noBusiness,{keys,tls:{...tls.clients.server,ca:tls.ca},callers:tls.callers,webOrigin:'https://web.test'});await identity.listen(0,'127.0.0.1');let idClosed=false;const closeIdentity=async()=>{if(!idClosed){idClosed=true;await identity.close();}};cleanup.push(closeIdentity);
  // Fixture alias only: notification certificate represents the RAG service; catalog is exercise-refs.
  const config={tls:{...tls.clients.server,ca:tls.ca},bffFingerprints:tls.callers.bff,refFingerprints:tls.callers.catalog,ragFingerprints:tls.callers.notification,
    identity:{...tls.clients.catalog,ca:tls.ca,origin:'https://127.0.0.1:'+identity.getHttpServer().address().port,issuer:'https://identity.test'}};
  const app=await createAdminApp(db,config);await app.listen(0,'127.0.0.1');cleanup.push(()=>app.close());const port=app.getHttpServer().address().port,actor=randomUUID();
  const token=()=>keys.assertion(actor,'ADMIN',new Date(Date.now()-1000),new Date(Date.now()+290000)).accessToken;
  function api(path,{method='GET',body,cert='notification',target=port,headers={}}={}){return new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port:target,path,method,...tls.clients[cert],ca:tls.ca,agent:false,signal:AbortSignal.timeout(7000),headers:{'content-type':'application/json',...(cert==='bff'?{authorization:'Bearer '+token()}:{}),...headers}},res=>{let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:text?JSON.parse(text):null}));});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});}
  const root='/internal/v1/catalog/snapshots',feed=new CatalogFeed(db);
  async function head(){const r=await api(root+'/head');assert.equal(r.status,200,JSON.stringify(r.body));assert.ok(validFeed('CatalogHead',r.body));assert.equal(r.headers['cache-control'],'no-store');return r.body;}
  async function capture(h){const r=await api(root+'/'+h.revision);assert.equal(r.status,200,JSON.stringify(r.body));assert.ok(validFeed('CatalogSnapshot',r.body));assert.equal(r.headers['cache-control'],'no-store');return r.body;}
  const drafts=new Map();async function create(id){const draft={id,slug:id.replaceAll('_','-'),nameVi:'Bài feed '+id,summary:'Hướng dẫn đã duyệt',instructions:['Đứng vững.','Thực hiện có kiểm soát.'],primaryMuscleIds:['quadriceps'],equipmentIds:['bodyweight'],sourceRef:'fixture:catalog-feed',workoutType:'STRENGTH',focusArea:'LOWER_BODY',difficulty:2};
    const r=await api('/api/v1/admin/exercises',{method:'POST',cert:'bff',body:draft,headers:{'idempotency-key':randomUUID()}});assert.equal(r.status,201,JSON.stringify(r.body));drafts.set(id,draft);return r;
  }
  async function publish(id){const current=await api('/api/v1/admin/exercises/'+id,{cert:'bff'});const r=await api('/api/v1/admin/exercises/'+id+'/publish',{method:'POST',cert:'bff',headers:{'if-match':current.headers.etag,'idempotency-key':randomUUID()}});assert.equal(r.status,200,JSON.stringify(r.body));return r;}
  async function archive(id){const current=await api('/api/v1/admin/exercises/'+id,{cert:'bff'});const r=await api('/api/v1/admin/exercises/'+id+'/unpublish',{method:'POST',cert:'bff',body:{reason:'Thu hồi fixture'},headers:{'if-match':current.headers.etag,'idempotency-key':randomUUID()}});assert.equal(r.status,200,JSON.stringify(r.body));return r;}
  await t.test('migration to 008 is idempotent and no fake head before bootstrap',async()=>{assert.equal((await db.query('SELECT max(version) AS v FROM catalog_migrations')).rows[0].v,8);assert.equal((await api(root+'/head')).status,503);});
  await importSnapshot(db,JSON.parse(await readFile('backend/services/catalog/data/smartgym-m2.json','utf8')),true);
  let initialHead,initialSnapshot;
  await t.test('RAG cert only; BFF ADMIN/refs/unknown cannot read feed, RAG cannot edit CMS or call refs',async()=>{
    for(const cert of ['bff','catalog','unknown'])assert.equal((await api(root+'/head',{cert})).status,403,cert);
    assert.equal((await api('/api/v1/admin/exercises')).status,403);assert.equal((await api('/internal/v1/catalog/exercise-refs',{method:'POST',body:{exerciseIds:['bodyweight_squat']}})).status,403);
    const disabled=await createAdminApp(db,{...config,ragFingerprints:[]});await disabled.listen(0,'127.0.0.1');try{assert.equal((await api(root+'/head',{target:disabled.getHttpServer().address().port})).status,403);}finally{await disabled.close();}
    for(const path of ['/head?userId=x','/bad%20revision','/missing_revision'])assert.equal((await api(root+path)).status,path==='/missing_revision'?404:400);
  });
  await t.test('published snapshot schema/digest/privacy, concurrent capture creates one immutable cache, draft excluded',async()=>{
    await create('feed_draft');initialHead=await head();const results=await Promise.all([capture(initialHead),capture(initialHead)]);assert.deepEqual(results[0],results[1]);initialSnapshot=results[0];assert.equal(initialSnapshot.exercises.length,35);assert.equal(initialSnapshot.exercises.some(e=>e.id==='feed_draft'),false);
    for(const source of initialSnapshot.sources){assert.equal(source.digestSha256,createHash('sha256').update(source.bodyMarkdown).digest('hex'));assert.ok(initialSnapshot.exercises.some(e=>e.id===source.exerciseId));assert.equal(source.sourceId,'ex_'+createHash('sha256').update(source.exerciseId).digest('hex'));}
    const rows=(await db.query('SELECT * FROM catalog_feed_snapshots WHERE revision=$1',[initialHead.revision])).rows;assert.equal(rows.length,1);assert.equal(rows[0].sha256,fingerprint(initialSnapshot));
    assert.ok(!JSON.stringify(initialSnapshot).includes('fixture:catalog-feed'));await assert.rejects(db.query('UPDATE catalog_feed_snapshots SET sha256=$1',['0'.repeat(64)]),/append-only/);
  });
  await t.test('publish/update/unpublish advance head atomically and old visible payload is withdrawn',async()=>{
    await publish('feed_draft');const h=await head();assert.ok(h.aggregateVersion>initialHead.aggregateVersion);let snap=await capture(h);assert.equal(snap.exercises.length,36);
    const current=await api('/api/v1/admin/exercises/feed_draft',{cert:'bff'});let r=await api('/api/v1/admin/exercises/feed_draft',{method:'PATCH',cert:'bff',body:{summary:'Hướng dẫn phiên bản hai'},headers:{'if-match':current.headers.etag}});assert.equal(r.status,200);await publish('feed_draft');const h2=await head();assert.ok(h2.aggregateVersion>h.aggregateVersion);snap=await capture(h2);assert.equal(snap.exercises.find(e=>e.id==='feed_draft').summary,'Hướng dẫn phiên bản hai');assert.equal((await api(root+'/'+h.revision)).status,410);
    await archive('feed_draft');const h3=await head();snap=await capture(h3);assert.equal(snap.exercises.length,35);assert.ok(snap.tombstones.some(e=>e.exerciseId==='feed_draft'&&e.reason==='ARCHIVED'));assert.equal((await api(root+'/'+h2.revision)).status,410);
    const events=(await db.query('SELECT payload FROM outbox_events WHERE payload->\'data\'->>\'exerciseId\'=$1 ORDER BY aggregate_version',['feed_draft'])).rows.map(r=>r.payload);assert.deepEqual(events.map(e=>e.type),['catalog.exercise.published.v1','catalog.exercise.updated.v1','catalog.exercise.unpublished.v1']);assert.ok(events.every(validCatalogEvent));
  });
  await t.test('unpublish → restore draft before materialization keeps tombstone; republish removes it',async()=>{
    await create('feed_restore');await publish('feed_restore');await archive('feed_restore');const before=await head(),current=await api('/api/v1/admin/exercises/feed_restore',{cert:'bff'});
    assert.equal((await api('/api/v1/admin/exercises/feed_restore/restore',{method:'POST',cert:'bff',headers:{'if-match':current.headers.etag,'idempotency-key':randomUUID()}})).status,200);
    const same=await head();assert.deepEqual(same,before);const snap=await capture(same);assert.ok(snap.tombstones.some(e=>e.exerciseId==='feed_restore'));assert.ok(!snap.exercises.some(e=>e.id==='feed_restore'));
    await publish('feed_restore');const latest=await capture(await head());assert.ok(!latest.tombstones.some(e=>e.exerciseId==='feed_restore'));assert.ok(latest.exercises.some(e=>e.id==='feed_restore'));
  });
  await t.test('current cache remains usable after retention, obsolete expired and known uncaptured revisions return 410',async()=>{
    const h=await head(),snap=await capture(h);await db.query('DELETE FROM catalog_feed_snapshots WHERE revision=$1',[h.revision]);await db.query('INSERT INTO catalog_feed_snapshots(revision,publication,sha256,expires_at) VALUES($1,$2,$3,$4)',[h.revision,JSON.stringify(snap),fingerprint(snap),'2000-01-01']);assert.deepEqual(await capture(h),snap);
    await create('feed_extra');await publish('feed_extra');assert.equal((await api(root+'/'+h.revision)).status,410);const unretained=await head();await create('feed_extra_two');await publish('feed_extra_two');assert.equal((await api(root+'/'+unretained.revision)).status,410);
  });
  await t.test('snapshot write failure returns no partial cache; retry succeeds, publication/outbox failure rolls back CMS',async()=>{
    const h=await head();let fail=true;const failing={...db,transaction:fn=>db.transaction(c=>fn({query:(sql,values)=>{if(fail&&sql.includes('INSERT INTO catalog_feed_snapshots'))throw Error('Injected feed cache failure');return c.query(sql,values);}}))};
    await assert.rejects(new CatalogFeed(failing).snapshot(h.revision));assert.equal((await db.query('SELECT * FROM catalog_feed_snapshots WHERE revision=$1',[h.revision])).rows.length,0);fail=false;assert.ok(validFeed('CatalogSnapshot',await new CatalogFeed(failing).snapshot(h.revision)));
    await create('feed_rollback');const bad={...db,transaction:fn=>db.transaction(c=>fn({query:(sql,values)=>{if(sql.includes('INSERT INTO outbox_events'))throw Error('Injected publication outbox failure');return c.query(sql,values);}}))};
    await assert.rejects(new AdminCatalog(bad).publish('feed_rollback',actor,1,randomUUID()));assert.equal((await db.query('SELECT lifecycle FROM exercises WHERE id=$1',['feed_rollback'])).rows[0].lifecycle,'DRAFT');assert.deepEqual(await head(),h);
  });
  await t.test('revoked pinned media fails head closed and denies cached snapshot without returning its body',async()=>{
    const h=await head();await capture(h);const asset='feed_media',upload='feed_upload';await db.query("INSERT INTO media_assets(id,lifecycle) VALUES($1,'PUBLISHED')",[asset]);
    await db.query(`INSERT INTO media_uploads(id,actor_id,object_key,object_version,expected_mime,expected_bytes,expected_sha256,detected_mime,status,expires_at,verified_at,revoked_at)
      VALUES($1,$2,'fixture/feed/media','object-v1','image/png',10,$3,'image/png','READY',now()+interval '1 day',now(),now())`,[upload,actor,'f'.repeat(64)]);
    await db.query(`INSERT INTO support_revisions(content_type,content_id,version,document,object_version,action) VALUES('media',$1,1,$2,'object-v1','PUBLISH')`,[asset,JSON.stringify({uploadId:upload,rightsStatus:'APPROVED'})]);
    const row=(await db.query("SELECT current_published_version AS version FROM exercises WHERE id='bodyweight_squat'")).rows[0];await db.query("INSERT INTO revision_media(exercise_id,version,media_id,support_version,display_order) VALUES('bodyweight_squat',$1,$2,1,0)",[row.version,asset]);
    assert.equal((await api(root+'/head')).status,503);const denied=await api(root+'/'+h.revision);assert.equal(denied.status,410);assert.equal(denied.body.exercises,undefined);
    await db.query('UPDATE media_uploads SET revoked_at=NULL WHERE id=$1',[upload]);assert.equal((await api(root+'/head')).status,200);
  });
  await t.test('feed reads do not depend on Identity JWKS availability',async()=>{await closeIdentity();assert.equal((await api(root+'/head')).status,200);await capture(await head());});
  // The following queue is a publisher-contract probe only; it does not implement RAG ingestion/index/citations.
  const broker=await startRabbit({publisher:'catalog'});cleanup.push(broker.stop);await provisionCatalogTopology(broker.url);await provisionCatalogTopology(broker.url);
  const connection=await connect(broker.url);connection.on('error',()=>{});cleanup.push(()=>connection.close());const channel=await connection.createChannel();channel.on('error',()=>{});
  const publisher=await ConfirmPublisher.open(broker.publisherUrl,undefined,true);cleanup.push(()=>publisher.close());let time=new Date(Date.now()+1000);const now=()=>new Date(time),relay=new OutboxRelay(db,publisher,now);
  async function probe(){const messages=[];for(;;){const m=await channel.get('smartgym.rag.catalog.v1',{noAck:false});if(!m)break;const e=JSON.parse(m.content);assert.ok(validCatalogEvent(e));assert.equal(m.properties.appId,'catalog');assert.equal(m.properties.messageId,e.id);assert.equal(m.fields.routingKey,e.type);assert.equal(m.properties.deliveryMode,2);messages.push(e);channel.ack(m);}return messages;}
  await t.test('real confirms/mandatory delivery to proposed quorum topology, contract probe observes monotonic catalog events',async()=>{
    while(await relay.tick()){}const messages=await probe();assert.ok(messages.length>=3);assert.ok(messages.every(e=>e.aggregateId==='catalog'));assert.ok(messages.every((e,i)=>i===0||e.aggregateVersion>messages[i-1].aggregateVersion));assert.equal((await db.query("SELECT 1 FROM outbox_events WHERE status='PENDING'")).rows.length,0);
  });
  await t.test('tombstone reason survives purging confirmed outbox history and rebuilding the feed cache',async()=>{
    const purged=await db.query("DELETE FROM outbox_events WHERE status='PUBLISHED' AND payload->'data'->>'exerciseId'='feed_draft' RETURNING event_id");assert.equal(purged.rows.length,3);
    const h=await head();await db.query('DELETE FROM catalog_feed_snapshots WHERE revision=$1',[h.revision]);const snap=await capture(h);
    assert.ok(snap.tombstones.some(e=>e.exerciseId==='feed_draft'&&e.reason==='ARCHIVED'));assert.ok(!snap.exercises.some(e=>e.id==='feed_draft'));
  });
  async function fixtureEvent(){const id=randomUUID(),revision='feed-'+randomUUID();return db.transaction(async c=>{const version=(await c.query('INSERT INTO publication_revisions(revision) VALUES($1) RETURNING aggregate_version',[revision])).rows[0].aggregate_version;const e={id,type:'catalog.exercise.published.v1',producer:'catalog',schemaVersion:1,aggregateId:'catalog',aggregateVersion:Number(version),occurredAt:new Date().toISOString(),correlationId:randomUUID(),data:{exerciseId:'bodyweight_squat',revision,contentRevision:1}};
    await c.query('INSERT INTO outbox_events(event_id,type,aggregate_version,occurred_at,correlation_id,payload) VALUES($1,$2,$3,$4,$5,$6)',[id,e.type,version,e.occurredAt,e.correlationId,JSON.stringify(e)]);return e;});}
  await t.test('lost confirm and DB failure after broker acceptance retry identical event ID; no premature PUBLISHED',async()=>{
    const e=await fixtureEvent();const uncertain=new OutboxRelay(db,{publish:async value=>{await publisher.publish(value);throw Error('Injected confirm lost');}},now);await assert.rejects(uncertain.tick());assert.equal((await db.query('SELECT status FROM outbox_events WHERE event_id=$1',[e.id])).rows[0].status,'PENDING');time=new Date(time.getTime()+6000);await relay.tick();const replayed=await probe();assert.equal(replayed.length,2);assert.deepEqual(replayed[0],replayed[1]);assert.equal(replayed[0].id,e.id);
    const next=await fixtureEvent();let fail=true;const broken={...db,query:(sql,values)=>{if(fail&&sql.includes("status='PUBLISHED'")){fail=false;throw Error('Injected post-confirm DB failure');}return db.query(sql,values);}};await assert.rejects(new OutboxRelay(broken,publisher,now).tick());time=new Date(time.getTime()+6000);await relay.tick();const again=await probe();assert.equal(again.length,2);assert.equal(again[0].id,next.id);assert.deepEqual(again[0],again[1]);
  });
  await t.test('two replicas claim once; stale lease can duplicate publish but cannot overwrite newer database result',async()=>{
    const e=await fixtureEvent();await Promise.all([relay.tick(),new OutboxRelay(db,publisher,now).tick()]);assert.equal((await probe()).filter(m=>m.id===e.id).length,1);
    const staleEvent=await fixtureEvent();let release,started;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);const stale=new OutboxRelay(db,{publish:async value=>{started();await gate;await publisher.publish(value);}},now);const pending=stale.tick();await ready;time=new Date(time.getTime()+31000);await relay.tick();const fresh=(await db.query('SELECT published_at,attempts FROM outbox_events WHERE event_id=$1',[staleEvent.id])).rows[0];release();await pending;const last=(await db.query('SELECT published_at,attempts FROM outbox_events WHERE event_id=$1',[staleEvent.id])).rows[0];assert.deepEqual(last,fresh);assert.equal(last.attempts,2);assert.equal((await probe()).length,2);
  });
  await t.test('unroutable messages stay pending and recover; malformed event never published; publisher ACL limits topic',async()=>{
    for(const action of ['published','updated','unpublished'])await channel.unbindQueue('smartgym.rag.catalog.v1','smartgym.events.v1','catalog.exercise.'+action+'.v1');const e=await fixtureEvent();await assert.rejects(relay.tick());assert.equal((await db.query('SELECT status FROM outbox_events WHERE event_id=$1',[e.id])).rows[0].status,'PENDING');await provisionCatalogTopology(broker.url);time=new Date(time.getTime()+6000);await relay.tick();assert.equal((await probe())[0].id,e.id);
    const poison=await fixtureEvent();await db.query("UPDATE outbox_events SET payload=jsonb_set(payload,'{data,revision}','\"head\"') || jsonb_build_object('producer','forged') WHERE event_id=$1",[poison.id]);await assert.rejects(relay.tick());assert.equal((await probe()).length,0);assert.equal((await db.query('SELECT status FROM outbox_events WHERE event_id=$1',[poison.id])).rows[0].status,'PENDING');
    assert.throws(()=>validateBrokerUrl('amqp://outside.test',true));const denied=await ConfirmPublisher.open(broker.publisherUrl,undefined,true);try{await assert.rejects(denied.publish({...e,type:'workout.occurrence.changed.v1'}));}finally{await denied.close();}
  });
  await t.test('Catalog relay starts independently from env and publishes without Identity/provider',async()=>{
    const e=await fixtureEvent(),process=startProcess(['dist/relay-main.js'],'backend/services/catalog',{DATABASE_URL:url.href,CATALOG_AMQP_URL:broker.publisherUrl,BROKER_ALLOW_LOOPBACK_PLAINTEXT:'true'});cleanup.push(()=>process.stop());
    await until(async()=>(await db.query('SELECT status FROM outbox_events WHERE event_id=$1',[e.id])).rows[0].status==='PUBLISHED','standalone relay confirm');await process.stop();const messages=await probe();assert.ok(messages.some(m=>m.id===e.id));
  });
});
