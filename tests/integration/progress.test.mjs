import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { request } from 'node:https';
import { createHash,generateKeyPairSync,randomBytes,randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import Ajv2020 from 'ajv/dist/2020.js';import addFormats from 'ajv-formats';
import { startPostgres,freePort } from '../helpers/postgres.mjs';
import { startProcess } from '../helpers/processes.mjs';
import { createTestTls } from '../../backend/services/identity/test/tls.cjs';
import { createApp as createIdentity } from '../../backend/services/identity/dist/app.js';
import { IdentityKeys } from '../../backend/services/identity/dist/modules/accounts/crypto.js';
import { connectDatabase } from '../../backend/services/progress/dist/database.js';
import { migrate } from '../../backend/services/progress/dist/migrate.js';
import { migrate as workoutMigrate } from '../../backend/services/workout/dist/migrate.js';
import { migrate as catalogMigrate } from '../../backend/services/catalog/dist/migrate.js';
import { importSnapshot } from '../../backend/services/catalog/dist/import.js';

test('Progress logs across independent databases, owner APIs and mTLS contracts',{timeout:150000},async t=>{
  const cleanup=[];t.after(async()=>{const errors=[];for(const close of cleanup.reverse())try{await close();}catch(e){errors.push(e);}if(errors.length)throw new AggregateError(errors,'Progress cleanup failed');});
  const pg=await startPostgres();cleanup.push(pg.stop);t.diagnostic(pg.version);
  const catalogDb=connectDatabase(pg.connectionString);cleanup.push(()=>catalogDb.close());await catalogMigrate(catalogDb);
  await importSnapshot(catalogDb,JSON.parse(await readFile('backend/services/catalog/data/smartgym-m2.json','utf8')),true);
  const urls={};for(const name of ['progress_test','workout_progress_test']){
    const password=randomBytes(24).toString('hex');await catalogDb.query("CREATE ROLE "+name+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '"+password+"'");await catalogDb.query('CREATE DATABASE '+name+' OWNER '+name);await catalogDb.query('REVOKE CONNECT ON DATABASE '+name+' FROM PUBLIC');
    const url=new URL(pg.connectionString);url.username=name;url.password=password;url.pathname='/'+name;urls[name]=url.href;
  }
  await catalogDb.query('REVOKE CONNECT ON DATABASE postgres FROM PUBLIC');
  const db=connectDatabase(urls.progress_test),workoutDb=connectDatabase(urls.workout_progress_test);cleanup.push(()=>db.close());cleanup.push(()=>workoutDb.close());
  await migrate(db);await migrate(db);await workoutMigrate(workoutDb);
  const tls=await createTestTls();cleanup.push(tls.stop);
  const keys=new IdentityKeys(generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}),'progress-test','https://identity.test',randomBytes(32),randomBytes(32));
  const noBusinessDb={query:async()=>{throw Error('JWKS fixture must not read business data');},transaction:async()=>{throw Error();},close:async()=>{}};
  const {app:identity}=await createIdentity(noBusinessDb,{keys,callers:tls.callers,webOrigin:'https://gym.test',tls:{...tls.clients.server,ca:tls.ca}});await identity.listen(0,'127.0.0.1');cleanup.push(()=>identity.close());
  const identityOrigin='https://127.0.0.1:'+identity.getHttpServer().address().port;
  const port=await freePort(),workoutPort=await freePort(),catalogPort=await freePort(),refsPort=await freePort();
  const certs=(prefix,client)=>Object.fromEntries([['KEY',client+'.key'],['CERT',client+'.crt'],['CA','ca.crt']].map(([key,file])=>[prefix+'_'+key+'_FILE',join(tls.directory,file)]));
  const catalog=startProcess(['dist/main.js'],'backend/services/catalog',{
    DATABASE_URL:pg.connectionString,PORT:String(catalogPort),HOST:'127.0.0.1',CATALOG_ADMIN_ENABLED:'true',CATALOG_ADMIN_PORT:String(refsPort),CATALOG_ADMIN_HOST:'127.0.0.1',CATALOG_MEDIA_ENABLED:'false',
    CATALOG_ADMIN_BFF_FINGERPRINTS:JSON.stringify(tls.callers.bff),CATALOG_REF_FINGERPRINTS:JSON.stringify([...tls.callers.notification,...tls.callers.catalog]),
    ...certs('CATALOG_ADMIN_TLS','server'),...certs('CATALOG_IDENTITY_TLS','catalog'),CATALOG_IDENTITY_ORIGIN:identityOrigin,CATALOG_IDENTITY_ISSUER:'https://identity.test',
  });cleanup.push(()=>catalog.stop());await catalog.waitFor('http://127.0.0.1:'+catalogPort+'/health/ready');
  const workout=startProcess(['dist/main.js'],'backend/services/workout',{
    DATABASE_URL:urls.workout_progress_test,WORKOUT_HOST:'127.0.0.1',WORKOUT_PORT:String(workoutPort),WORKOUT_BFF_FINGERPRINTS:JSON.stringify(tls.callers.bff),WORKOUT_PROGRESS_FINGERPRINTS:JSON.stringify(tls.callers.catalog),
    ...certs('WORKOUT_TLS','server'),...certs('WORKOUT_IDENTITY_TLS','catalog'),WORKOUT_IDENTITY_ORIGIN:identityOrigin,WORKOUT_IDENTITY_ISSUER:'https://identity.test',
    WORKOUT_CATALOG_ORIGIN:'https://127.0.0.1:'+refsPort,...certs('WORKOUT_CATALOG_TLS','notification'),
  });cleanup.push(()=>workout.stop());
  const config={DATABASE_URL:urls.progress_test,PROGRESS_HOST:'127.0.0.1',PROGRESS_PORT:String(port),PROGRESS_BFF_FINGERPRINTS:JSON.stringify(tls.callers.bff),
    ...certs('PROGRESS_TLS','server'),...certs('PROGRESS_IDENTITY_TLS','catalog'),PROGRESS_IDENTITY_ORIGIN:identityOrigin,PROGRESS_IDENTITY_ISSUER:'https://identity.test',
    PROGRESS_CATALOG_ORIGIN:'https://127.0.0.1:'+refsPort,...certs('PROGRESS_CATALOG_TLS','catalog'),PROGRESS_WORKOUT_ORIGIN:'https://127.0.0.1:'+workoutPort,...certs('PROGRESS_WORKOUT_TLS','catalog')};
  let api=startProcess(['dist/main.js'],'backend/services/progress',config);cleanup.push(()=>api.stop());
  const owner=randomUUID(),other=randomUUID(),root='/api/v1/progress/logs';
  const token=(user=owner,role='USER',expired=false)=>keys.assertion(user,role,new Date(Date.now()-10000),new Date(Date.now()+(expired?-1000:290000))).accessToken;
  function call(path,{method='GET',body,user=owner,role='USER',caller='bff',bearer=token(user,role),match,key,target=port,raw}={}){
    return new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port:target,path,method,ca:tls.ca,...(caller?tls.clients[caller]:{}),agent:false,signal:AbortSignal.timeout(8000),headers:{'content-type':'application/json',...(bearer?{authorization:'Bearer '+bearer}:{}),...(match?{'if-match':match}:{}),...(key?{'idempotency-key':key}:{})}},res=>{
      let text='';res.on('data',c=>text+=c);res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:text?JSON.parse(text):null}));
    });req.on('error',reject);req.end(raw??(body===undefined?undefined:JSON.stringify(body)));});
  }
  const apiContract=JSON.parse(await readFile('docs/api/openapi.yaml','utf8')),ajv=new Ajv2020({strict:false});addFormats(ajv);ajv.addSchema({$id:'api',components:apiContract.components});
  async function checked(path,options={},status=200,schema){const r=await call(path,options);assert.equal(r.status,status,JSON.stringify(r.body));assert.equal(r.headers['cache-control'],'no-store');if(schema||status>=400){const valid=ajv.getSchema('api#/components/schemas/'+(schema??'Problem'));assert.ok(valid(r.body),JSON.stringify(valid.errors));}return r;}
  async function ready(target){for(let i=0;i<100;i++){try{if((await call('/health/ready',{target})).status===200)return;}catch{}await delay(100);}throw Error('Progress/Workout startup timeout');}
  await ready(port);await ready(workoutPort);
  const input={performedAt:'2020-01-01T10:00:00+07:00',notes:'Buổi tập thật',sets:[{exerciseId:'bodyweight_squat',ordinal:2,repetitions:12,weightKg:0.123456789,rpe:7},{exerciseId:'push_up',ordinal:1,durationSeconds:45},{exerciseId:'bodyweight_squat',ordinal:1,repetitions:10,durationSeconds:30,weightKg:0}]};
  const post=(body=input,key=randomUUID())=>({method:'POST',body,key});
  async function occurrence(user=owner){const plan=(await checked('/api/v1/workout-plans',{...post({name:'Snapshot buổi tập',exercises:[{exerciseId:'bodyweight_squat',sets:3,targetReps:12}]}),target:workoutPort,user},201)).body;
    const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10),schedule=(await checked('/api/v1/workout-schedules',{...post({planId:plan.id,timeZone:'UTC',startDate:tomorrow,startLocalTime:'12:00',durationMinutes:60,recurrence:'ONCE'}),target:workoutPort,user},201)).body;
    return (await workoutDb.query('SELECT id FROM workout_occurrences WHERE schedule_id=$1',[schedule.id])).rows[0].id;
  }
  let manual,manualKey,scheduled,occurrenceId;
  await t.test('migration replay/checksum and cross-service database access are enforced',async()=>{
    const row=(await db.query('SELECT checksum FROM progress_migrations')).rows[0];const sql=await readFile('backend/services/progress/migrations/001_workout_logs.sql','utf8');assert.equal(row.checksum,createHash('sha256').update(sql).digest('hex'));
    await db.query("UPDATE progress_migrations SET checksum='changed'");await assert.rejects(migrate(db),/history mismatch/);await db.query('UPDATE progress_migrations SET checksum=$1',[row.checksum]);await migrate(db);
    await assert.rejects(db.query('SELECT * FROM workout_schedules'),e=>e.code==='42P01');
    for(const database of ['postgres','workout_progress_test']){const url=new URL(urls.progress_test);url.pathname='/'+database;const forbidden=connectDatabase(url.href);try{await assert.rejects(forbidden.query('SELECT 1'),e=>e.code==='42501');}finally{await forbidden.close();}}
  });
  await t.test('mutual TLS, caller allowlist, owner assertions and expiry are mandatory',async()=>{
    await assert.rejects(call(root,{caller:null}));await checked(root,{caller:'unknown'},403);await checked(root,{caller:'catalog'},403);await checked(root,{bearer:''},401);await checked(root,{bearer:token(owner,'USER',true)},401);
    await checked('/health/ready');await checked('/health/live');
  });
  await t.test('set, source, finite value and performed-time validation rejects before writes',async()=>{
    const invalid=[{...input,ownerUserId:other},{...input,source:'POSE'},{...input,notes:'bad'+String.fromCharCode(0)},{...input,performedAt:'2030-02-30T00:00:00Z'},
      {...input,performedAt:new Date(Date.now()+86400000).toISOString()},{...input,sets:[]},{...input,sets:[{exerciseId:'bodyweight_squat',ordinal:1}]},
      {...input,sets:[{...input.sets[0],weightKg:Infinity}]},{...input,sets:[{...input.sets[0],exerciseNameVi:'Client snapshot'}]},
      {...input,sets:[input.sets[0],input.sets[0]]}];
    for(const body of invalid)await checked(root,post(body),422);await checked(root,{method:'POST',body:input},400);await checked(root,{method:'POST',key:randomUUID(),raw:'{malformed'},400);
    await checked(root,post({...input,sets:[{exerciseId:'not_published',ordinal:1,repetitions:1}]}),422);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM workout_logs')).rows[0].n,0);
  });
  await t.test('concurrent retries create one manual log with server snapshots and exact decimal weights',async()=>{
    manualKey=randomUUID();const [a,b]=await Promise.all([checked(root,post(input,manualKey),201,'WorkoutLog'),checked(root,post(input,manualKey),201,'WorkoutLog')]);assert.deepEqual(a.body,b.body);manual=a.body;
    assert.equal(a.headers.location,root+'/'+manual.id);assert.equal(a.headers.etag,'"v1"');assert.equal(manual.source,'MANUAL');assert.equal(manual.performedAt,'2020-01-01T03:00:00.000Z');
    assert.deepEqual(manual.sets.map(s=>[s.exerciseId,s.ordinal]),[['bodyweight_squat',1],['bodyweight_squat',2],['push_up',1]]);assert.equal(manual.sets[1].weightKg,0.123456789);assert.equal(manual.sets[0].exerciseNameVi,'Squat không tạ');
    await checked(root,post({...input,notes:'Changed'},manualKey),409);await checked(root+'/'+manual.id,{user:other,role:'ADMIN'},404);assert.equal((await checked(root,{user:other})).body.items.length,0);
  });
  await t.test('only one updater wins an ETag and source ownership cannot be changed',async()=>{
    const path=root+'/'+manual.id;await checked(path,{method:'PUT',body:input},428);await checked(path,{method:'PUT',body:input,match:'W/"v1"'},400);
    await checked(path,{method:'PUT',body:input,match:'"v1"',user:other,role:'ADMIN'},404);
    await checked(path,{method:'PUT',body:{...input,occurrenceId:randomUUID()},match:'"v1"'},409);
    const results=await Promise.all(['A','B'].map(notes=>call(path,{method:'PUT',body:{...input,notes},match:'"v1"'})));assert.deepEqual(results.map(x=>x.status).sort(),[200,412]);
    manual=results.find(x=>x.status===200).body;assert.equal(manual.version,2);assert.deepEqual((await checked(root,post(input,manualKey),201)).body.version,1);
  });
  await t.test('only Progress certificate may read occurrence snapshots for the asserted owner',async()=>{
    occurrenceId=await occurrence();const path='/internal/v1/workout/occurrences/'+occurrenceId;
    await checked(path,{target:workoutPort},403);await checked(path,{target:workoutPort,caller:'unknown'},403);await checked(path,{target:workoutPort,caller:'catalog',user:other,role:'ADMIN'},404);
    await checked(path,{target:workoutPort,caller:'catalog'},200,'WorkoutOccurrence');await checked('/api/v1/workout-plans',{target:workoutPort,caller:'catalog'},403);
    await checked(root,{...post({...input,occurrenceId}),user:other,role:'ADMIN'},404);
  });
  await t.test('different keys racing for one occurrence commit exactly one log and preserve provenance',async()=>{
    const body={...input,occurrenceId,sets:[input.sets[0]]};const results=await Promise.all([call(root,post(body)),call(root,post(body))]);assert.deepEqual(results.map(x=>x.status).sort(),[201,409]);scheduled=results.find(x=>x.status===201).body;
    assert.equal(scheduled.source,'OCCURRENCE');assert.equal(scheduled.occurrenceId,occurrenceId);const row=(await db.query('SELECT source_snapshot FROM workout_logs WHERE id=$1',[scheduled.id])).rows[0];assert.equal(row.source_snapshot.id,occurrenceId);assert.equal(row.source_snapshot.version,1);
    const before=await checked(root+'/'+scheduled.id);await checked('/api/v1/workout-occurrences/'+occurrenceId,{target:workoutPort,method:'PATCH',match:'"v1"',body:{startAt:new Date(Date.now()+2*86400000).toISOString(),endAt:new Date(Date.now()+2*86400000+3600000).toISOString(),timeZone:'UTC'}});
    assert.deepEqual((await checked(root+'/'+scheduled.id)).body,before.body);
    await checked('/api/v1/workout-occurrences/'+occurrenceId+'/cancel',{target:workoutPort,method:'POST',match:'"v2"'},204);assert.deepEqual((await checked(root+'/'+scheduled.id)).body,before.body);
    await checked(root+'/'+scheduled.id,{method:'PUT',match:'"v1"',body:{...input,occurrenceId:randomUUID()}},409);
    scheduled=(await checked(root+'/'+scheduled.id,{method:'PUT',match:'"v1"',body:{...input,sets:[input.sets[0]]}})).body;assert.equal(scheduled.occurrenceId,occurrenceId);
  });
  await t.test('failed set writes roll back log, sets, receipt and replacement atomically',async()=>{
    const subject=randomUUID(),key=randomUUID();
    await db.query(`CREATE FUNCTION fail_progress_set() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.ordinal=2 THEN RAISE EXCEPTION 'set fixture'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_set BEFORE INSERT ON log_sets FOR EACH ROW EXECUTE FUNCTION fail_progress_set()`);
    try{
      await checked(root,{...post(input,key),user:subject},503);assert.equal((await db.query('SELECT count(*)::int AS n FROM workout_logs WHERE owner_user_id=$1',[subject])).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int AS n FROM progress_idempotency WHERE owner_user_id=$1',[subject])).rows[0].n,0);
      const before=(await checked(root+'/'+manual.id)).body;await checked(root+'/'+manual.id,{method:'PUT',match:'"v2"',body:{...input,notes:'Must roll back'}},503);assert.deepEqual((await checked(root+'/'+manual.id)).body,before);
    }finally{await db.query('DROP TRIGGER fail_set ON log_sets; DROP FUNCTION fail_progress_set()');}
    await checked(root,{...post(input,key),user:subject},201,'WorkoutLog');
  });
  await t.test('list uses bounded keyset pages with owner, UTC filters, exercise filter and stable ties',async()=>{
    const subject=randomUUID();for(let i=0;i<5;i++)await checked(root,{...post({...input,notes:String(i)}),user:subject},201);
    const base=root+'?limit=2&from=2019-12-31T00:00:00Z&to=2020-01-02T00:00:00Z&exerciseId=push_up';const seen=[];let url=base,firstCursor;
    for(;;){const result=await checked(url,{user:subject},200,'WorkoutLogPage');assert.ok(result.body.items.length<=2);seen.push(...result.body.items.map(x=>x.id));const cursor=result.body.nextCursor;if(!cursor)break;firstCursor??=cursor;url=base+'&cursor='+cursor;}
    assert.equal(seen.length,5);assert.equal(new Set(seen).size,5);assert.deepEqual(seen,[...seen].sort().reverse());
    await checked(base+'&cursor='+firstCursor,{user:other},400);await checked(root+'?limit=1&cursor='+firstCursor,{user:subject},400);
    await checked(root+'?from=bad',{},400);await checked(root+'?from=2020-01-02T00:00:00Z&to=2020-01-01T00:00:00Z',{},400);await checked(root+'?exerciseId=bad%27',{},400);await checked(root+'?unknown=1',{},400);
  });
  await t.test('soft delete erases payloads, hides reads and preserves occurrence reservation across receipt expiry',async()=>{
    const subject=randomUUID(),occ=await occurrence(subject),key=randomUUID(),body={...input,occurrenceId:occ,sets:[input.sets[0]]};
    const log=(await checked(root,{...post(body,key),user:subject},201)).body;
    await checked(root+'/'+log.id,{method:'DELETE',user:other,role:'ADMIN',match:'"v1"'},404);await checked(root+'/'+log.id,{method:'DELETE',user:subject},428);
    await checked(root+'/'+log.id,{method:'DELETE',user:subject,match:'"v1"'},204);await checked(root+'/'+log.id,{user:subject},404);await checked(root+'/'+log.id,{method:'DELETE',user:subject,match:'"v1"'},412);
    await checked(root,{...post(body,key),user:subject},410);await checked(root,{...post(body),user:subject},409);
    const row=(await db.query('SELECT notes,duration_seconds,source_snapshot FROM workout_logs WHERE id=$1',[log.id])).rows[0];assert.deepEqual(row,{notes:null,duration_seconds:null,source_snapshot:{}});assert.equal((await db.query('SELECT count(*)::int AS n FROM log_exercises WHERE log_id=$1',[log.id])).rows[0].n,0);
    assert.equal((await db.query('SELECT response FROM progress_idempotency WHERE log_id=$1',[log.id])).rows[0].response,null);
    await db.query("UPDATE progress_idempotency SET expires_at=now()-interval '1 day' WHERE log_id=$1",[log.id]);await checked(root,{...post(body,key),user:subject},409);
    assert.equal((await checked(root,{user:subject})).body.items.length,0);
  });
  await t.test('database constraints reject non-finite weights and duplicate occurrence reservations directly',async()=>{
    const set=(await db.query('SELECT * FROM log_sets LIMIT 1')).rows[0];for(const value of ['NaN','Infinity','-Infinity'])await assert.rejects(db.query('UPDATE log_sets SET weight_kg=$2 WHERE id=$1',[set.id,value]),e=>e.code==='23514');
    await assert.rejects(db.query(`INSERT INTO workout_logs(id,owner_user_id,occurrence_id,performed_at,source_type,source_snapshot) VALUES($1,$2,$3,now(),'OCCURRENCE','{}')`,[randomUUID(),owner,occurrenceId]),e=>e.constraint==='progress_occurrence_once');
    const sets=Array.from({length:200},(_,i)=>({exerciseId:i<100?'bodyweight_squat':'push_up',ordinal:i%100+1,repetitions:1}));await checked(root,{...post({...input,sets}),user:randomUUID()},201,'WorkoutLog');
  });
  await t.test('summary counts logs once, uses exact volume and reflects edits and deletes at local day boundaries',async()=>{
    const subject=randomUUID(),summary='/api/v1/progress/summary?from=2020-01-01&to=2020-01-02&timeZone=Asia%2FBangkok';
    const first={performedAt:'2020-01-01T16:59:59.999Z',sets:[{exerciseId:'bodyweight_squat',ordinal:1,repetitions:2,weightKg:0.1},{exerciseId:'push_up',ordinal:1,durationSeconds:45,weightKg:10}]};
    const second={performedAt:'2020-01-01T17:00:00Z',sets:[{exerciseId:'bodyweight_squat',ordinal:1,repetitions:3,weightKg:0.1},{exerciseId:'push_up',ordinal:1,repetitions:5}]};
    const a=(await checked(root,{...post(first),user:subject},201)).body,b=(await checked(root,{...post(second),user:subject},201)).body;
    await checked(root,{...post({...first,performedAt:'2020-01-02T17:00:00Z'}),user:subject},201);
    let s=(await checked(summary,{user:subject},200,'ProgressSummary')).body;
    assert.equal(s.workoutCount,2);assert.equal(s.totalRepetitions,10);assert.equal(s.totalVolumeKg,0.5);
    assert.deepEqual(s.series,[{date:'2020-01-01',workoutCount:1,repetitions:2,volumeKg:0.2},{date:'2020-01-02',workoutCount:1,repetitions:8,volumeKg:0.3}]);
    assert.equal((await checked(summary,{user:other})).body.workoutCount,0);
    await checked(root+'/'+b.id,{user:subject,method:'PUT',match:'"v1"',body:{...second,sets:[{...second.sets[0],weightKg:0.2},second.sets[1]]}});
    assert.equal((await checked(summary,{user:subject})).body.totalVolumeKg,0.8);
    await checked(root+'/'+a.id,{user:subject,method:'DELETE',match:'"v1"'},204);
    s=(await checked(summary,{user:subject})).body;assert.equal(s.workoutCount,1);assert.equal(s.totalVolumeKg,0.6);assert.equal(s.series[0].workoutCount,0);
    const utc=(await checked(summary.replace('Asia%2FBangkok','UTC'),{user:subject})).body;assert.equal(utc.workoutCount,2);
  });
  await t.test('summary validates 366 local dates and returns zero-filled leap-year series',async()=>{
    const base='/api/v1/progress/summary';const subject=randomUUID();
    const empty=(await checked(base+'?from=2024-01-01&to=2024-12-31&timeZone=UTC',{user:subject},200,'ProgressSummary')).body;
    assert.equal(empty.series.length,366);assert.equal(empty.totalVolumeKg,0);assert.equal(empty.series[59].date,'2024-02-29');assert.ok(empty.series.every(d=>d.workoutCount===0));
    for(const query of ['from=2024-01-01&to=2025-01-01&timeZone=UTC','from=2024-02-30&to=2024-03-01&timeZone=UTC','from=2024-01-02&to=2024-01-01&timeZone=UTC',
      'from=2024-01-01&to=2024-01-01&timeZone=Invalid%2FZone','from=2024-01-01&to=2024-01-01&timeZone=%2B07:00','from=2024-01-01','from=2024-01-01&to=2024-01-01&timeZone=UTC&unknown=1'])await checked(base+'?'+query,{user:subject},400);
  });
  await t.test('summary spans DST days and retains decimal precision without JS accumulation',async()=>{
    const subject=randomUUID();for(const at of ['2020-03-08T04:59:59.999Z','2020-03-08T05:00:00Z','2020-03-09T03:59:59.999Z','2020-03-09T04:00:00Z'])await checked(root,{...post({performedAt:at,sets:[{exerciseId:'bodyweight_squat',ordinal:1,repetitions:1,weightKg:1}]}),user:subject},201);
    const dst=(await checked('/api/v1/progress/summary?from=2020-03-08&to=2020-03-08&timeZone=America%2FNew_York',{user:subject},200,'ProgressSummary')).body;assert.equal(dst.workoutCount,2);assert.equal(dst.totalVolumeKg,2);
    const skipped=(await checked('/api/v1/progress/summary?from=2011-12-30&to=2011-12-30&timeZone=Pacific%2FApia',{user:subject})).body;assert.equal(skipped.workoutCount,0);assert.equal(skipped.series.length,1);
    for(const [at,weightKg]of [['2020-01-01T00:00:00Z',0.123456789123],['2020-01-02T00:00:00Z',0.0000000000001]])await checked(root,{...post({performedAt:at,sets:[{exerciseId:'bodyweight_squat',ordinal:1,repetitions:1,weightKg}]}),user:subject},201);
    assert.equal((await checked('/api/v1/progress/summary?from=2020-01-01&to=2020-01-02&timeZone=UTC',{user:subject})).body.totalVolumeKg,0.1234567891231);
  });
  await t.test('withdrawn names survive, canceled occurrences remain loggable and dependency outages preserve reads/replay after restart',async()=>{
    const subject=randomUUID(),occ=await occurrence(subject);await checked('/api/v1/workout-occurrences/'+occ+'/cancel',{target:workoutPort,user:subject,method:'POST',match:'"v1"'},204);
    await catalogDb.query("UPDATE exercises SET lifecycle='ARCHIVED' WHERE id='bodyweight_squat'");
    await checked(root,post({...input,sets:[input.sets[0]]}),422);
    manual=(await checked(root+'/'+manual.id,{method:'PUT',match:'"v2"',body:{...input,notes:'Giữ snapshot gốc'}})).body;
    await catalog.stop();const body={...input,occurrenceId:occ,sets:[input.sets[0]]},key=randomUUID();
    const log=await checked(root,{...post(body,key),user:subject},201,'WorkoutLog');assert.equal(log.body.sets[0].exerciseNameVi,'Squat không tạ');
    await workout.stop();await api.stop();api=startProcess(['dist/main.js'],'backend/services/progress',config);await ready(port);
    assert.deepEqual((await checked(root,{...post(body,key),user:subject},201)).body,log.body);await checked(root+'/'+log.body.id,{user:subject},200,'WorkoutLog');
    await checked(root,post(input),503);await checked(root,{...post({...input,occurrenceId:randomUUID()}),user:subject},503);
    await checked(root+'/'+log.body.id,{user:subject,method:'PUT',match:'"v1"',body:{...body,notes:'Sửa khi provider tắt'}});
    await checked('/health/ready');
    assert.equal((await checked('/api/v1/progress/summary?from=2020-01-01&to=2020-01-01&timeZone=UTC',{user:subject},200,'ProgressSummary')).body.workoutCount,1);
  });
});
