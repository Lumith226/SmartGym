import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {request as httpsRequest} from 'node:https';import {request} from '@playwright/test';
import {startAuthStack} from '../helpers/auth-stack.mjs';import {seedPoseResult} from '../helpers/pose-summary.mjs';
test('T25 import over Web/BFF → Progress → real owner Pose summary API and separate databases',{timeout:180000},async t=>{
  const stack=await startAuthStack({pose:true});t.after(()=>stack.stop());const contexts=[];t.after(async()=>{for(const c of contexts)await c.dispose();});
  const h={Origin:stack.url,'X-SmartGym-CSRF':'1'},path='/api/v1/progress/pose-imports';
  async function account(){const c=await request.newContext({baseURL:stack.url,ignoreHTTPSErrors:true,extraHTTPHeaders:h});contexts.push(c);const email='pose-import-'+randomUUID()+'@example.test',password='SmartGym pose import 123!';
    assert.equal((await c.post('/api/v1/auth/register',{data:{email,password,displayName:'Người lưu AI'}})).status(),202);const token=new URLSearchParams(new URL(await stack.mailLink(email,'verify')).hash.slice(1)).get('token');assert.equal((await c.post('/api/v1/auth/verify-email',{data:{token}})).status(),204);assert.equal((await c.post('/api/v1/auth/login',{data:{email,password}})).status(),200);const profile=await(await c.get('/api/v1/me')).json();return{c,owner:profile.id};}
  const {c,owner}=await account(),other=await account();const post=(body,key=randomUUID(),client=c)=>client.post(path,{headers:{'Idempotency-Key':key},data:body});
  const seed=changes=>seedPoseResult(stack.poseDb,owner,changes);
  let retained,retainedInput,retainedKey,created;
  await t.test('imports one aggregate set, immutable selected provenance, correct Location/ETag and no raw/media',async()=>{
    retained=await seed();retainedInput={poseResultId:retained.id};retainedKey=randomUUID();const r=await post(retainedInput,retainedKey);assert.equal(r.status(),201,await r.text());created=await r.json();
    assert.equal(r.headers().location,'/api/v1/progress/logs/'+created.id);assert.equal(r.headers().etag,'"v1"');assert.equal(created.source,'POSE');assert.equal(created.performedAt,retained.completedAt);assert.equal(created.poseResultId,retained.id);
    assert.deepEqual(created.sets,[{exerciseId:'bodyweight_squat',exerciseNameVi:'Squat không tạ',ordinal:1,repetitions:12}]);assert.equal(created.poseSummary.repCount,12);assert.equal(created.poseSummary.modelVersion,'stored-fixture-v1');assert.equal(created.poseSummary.formStatus,'INSUFFICIENT_EVIDENCE');
    const stored=JSON.stringify((await stack.progressDb.query('SELECT source_snapshot FROM workout_logs WHERE id=$1',[created.id])).rows);assert.ok(!stored.includes('raw_model_result'));assert.ok(!stored.includes('private raw'));assert.equal(stack.poseSummary.storageCalls(),0);
  });
  await t.test('same key concurrent replay returns one log, changed payload conflicts; different keys link existing log',async()=>{
    const rs=await Promise.all(Array.from({length:3},()=>post(retainedInput,retainedKey)));for(const r of rs){assert.equal(r.status(),201);assert.deepEqual(await r.json(),created);}
    let r=await post({...retainedInput,performedAt:'2020-01-01T00:00:00Z'},retainedKey);assert.equal(r.status(),409);assert.equal((await r.json()).code,'IDEMPOTENCY_CONFLICT');
    r=await post(retainedInput);assert.equal(r.status(),409);assert.equal((await r.json()).detail,'/api/v1/progress/logs/'+created.id);
    const source=await seed();const races=await Promise.all([post({poseResultId:source.id}),post({poseResultId:source.id})]);assert.deepEqual(races.map(r=>r.status()).sort(),[201,409]);assert.equal((await stack.progressDb.query('SELECT id FROM workout_logs WHERE owner_user_id=$1 AND pose_result_id=$2',[owner,source.id])).rows.length,1);
  });
  await t.test('foreign result inaccessible even to ADMIN; body/header cannot supply owner or rep count',async()=>{
    const source=await seed();let r=await post({poseResultId:source.id},randomUUID(),other.c);assert.equal(r.status(),404);
    r=await c.post(path,{headers:{'Idempotency-Key':randomUUID(),'x-user-id':other.owner,'x-user-role':'ADMIN'},data:{poseResultId:source.id,repCount:99}});assert.equal(r.status(),422);
    const foreignToken=stack.keys.assertion(other.owner,'ADMIN',new Date(Date.now()-1000),new Date(Date.now()+290000)).accessToken;
    const response=await new Promise((resolve,reject)=>{const req=httpsRequest(new URL(path,stack.progressOrigin),{...stack.testTls.clients.bff,ca:stack.testTls.ca,method:'POST',agent:false,headers:{authorization:'Bearer '+foreignToken,'content-type':'application/json','idempotency-key':randomUUID()}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(JSON.stringify({poseResultId:source.id}));});assert.equal(response,404);
  });
  await t.test('video UNAVAILABLE, live zero/null, absent and expired result do not create log/receipt',async()=>{
    for(const changes of [{source:'VIDEO',repCount:null,repCountStatus:'UNAVAILABLE'},{repCount:0},{repCount:null,repCountStatus:'UNAVAILABLE'}]){
      const source=await seed(changes),key=randomUUID(),r=await post({poseResultId:source.id},key);assert.equal(r.status(),422);assert.equal((await r.json()).code,'NO_LOGGABLE_RESULT');assert.equal((await stack.progressDb.query('SELECT id FROM workout_logs WHERE pose_result_id=$1',[source.id])).rows.length,0);assert.equal((await stack.progressDb.query('SELECT key FROM progress_idempotency WHERE key=$1',[key])).rows.length,0);
    }
    assert.equal((await post({poseResultId:randomUUID()})).status(),404);const expired=await seed({completedAt:'2020-01-01T00:00:00Z',expiresAt:'2020-01-02T00:00:00Z'});const r=await post({poseResultId:expired.id});assert.equal(r.status(),410);assert.equal((await r.json()).code,'RESULT_EXPIRED');
  });
  await t.test('valid explicit performedAt accepted, future time and unavailable Catalog rejected without reservation',async()=>{
    let source=await seed();const r=await post({poseResultId:source.id,performedAt:'2020-01-01T10:00:00+07:00'});assert.equal(r.status(),201);assert.equal((await r.json()).performedAt,'2020-01-01T03:00:00.000Z');
    source=await seed();assert.equal((await post({poseResultId:source.id,performedAt:new Date(Date.now()+86400000).toISOString()})).status(),422);source=await seed({exerciseId:'not_in_catalog'});assert.equal((await post({poseResultId:source.id})).status(),422);
  });
  await t.test('optional owner occurrence has durable snapshot and one log reservation shared with manual logs',async()=>{
    const plan=await c.post('/api/v1/workout-plans',{headers:{'Idempotency-Key':randomUUID()},data:{name:'Liên kết AI',exercises:[{exerciseId:'bodyweight_squat',sets:3,targetReps:10}]}});assert.equal(plan.status(),201);
    const start=new Date(Date.now()+86400000).toISOString();const rule=await c.post('/api/v1/workout-schedules',{headers:{'Idempotency-Key':randomUUID()},data:{planId:(await plan.json()).id,timeZone:'UTC',startDate:start.slice(0,10),startLocalTime:'18:00',durationMinutes:60,recurrence:'ONCE'}});assert.equal(rule.status(),201);const schedule=(await rule.json()).id;
    const occurrence=(await stack.workoutDb.query('SELECT * FROM workout_occurrences WHERE schedule_id=$1',[schedule])).rows[0],source=await seed();const input={poseResultId:source.id,occurrenceId:occurrence.id};const r=await post(input);assert.equal(r.status(),201);const log=await r.json();assert.equal(log.occurrenceId,occurrence.id);
    const foreign=await post({poseResultId:(await seedPoseResult(stack.poseDb,other.owner)).id,occurrenceId:occurrence.id},randomUUID(),other.c);assert.equal(foreign.status(),404);
    const manual=await c.post('/api/v1/progress/logs',{headers:{'Idempotency-Key':randomUUID()},data:{occurrenceId:occurrence.id,performedAt:'2020-01-01T00:00:00Z',sets:[{exerciseId:'bodyweight_squat',ordinal:1,repetitions:1}]}});assert.equal(manual.status(),409);
    const snapshot=(await stack.progressDb.query('SELECT source_snapshot FROM workout_logs WHERE id=$1',[log.id])).rows[0].source_snapshot;assert.equal(snapshot.id,occurrence.id);assert.equal(snapshot.poseSummary.id,source.id);
  });
  await t.test('set corrections keep original Pose snapshot, source immutable and summary counts actual reps once',async()=>{
    const before=await c.get('/api/v1/progress/logs/'+created.id);const updated=await c.put('/api/v1/progress/logs/'+created.id,{headers:{'If-Match':before.headers().etag},data:{performedAt:created.performedAt,sets:[{exerciseId:'bodyweight_squat',ordinal:1,repetitions:8}]}});assert.equal(updated.status(),200);const data=await updated.json();assert.equal(data.sets[0].repetitions,8);assert.deepEqual(data.poseSummary,created.poseSummary);
    const otherOccurrence=await c.put('/api/v1/progress/logs/'+created.id,{headers:{'If-Match':updated.headers().etag},data:{performedAt:created.performedAt,occurrenceId:randomUUID(),sets:[{exerciseId:'bodyweight_squat',ordinal:1,repetitions:8}]}});assert.equal(otherOccurrence.status(),409);
    const day=new Date().toISOString().slice(0,10),next=new Date(Date.parse(day)+86400000).toISOString();
    const expected=(await stack.progressDb.query(`SELECT count(DISTINCT l.id)::integer AS logs,coalesce(sum(s.repetitions),0)::integer AS reps FROM workout_logs l
      JOIN log_exercises e ON e.log_id=l.id JOIN log_sets s ON s.log_exercise_id=e.id WHERE l.owner_user_id=$1 AND l.deleted_at IS NULL AND l.performed_at>=$2 AND l.performed_at<$3`,[owner,day,next])).rows[0];
    const summary=await c.get('/api/v1/progress/summary?'+new URLSearchParams({from:day,to:day,timeZone:'UTC'}));assert.equal(summary.status(),200);const totals=await summary.json();assert.equal(totals.workoutCount,expected.logs);assert.equal(totals.totalRepetitions,expected.reps);assert.equal(totals.totalVolumeKg,0);
  });
  await t.test('set insert failure rolls back log/snapshot/receipt then same key succeeds',async()=>{
    const source=await seed(),key=randomUUID();await stack.progressDb.query("CREATE FUNCTION fail_pose_set() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected private SQL failure'; END $$");await stack.progressDb.query('CREATE TRIGGER fail_pose_set BEFORE INSERT ON log_sets FOR EACH STATEMENT EXECUTE FUNCTION fail_pose_set()');
    try{const r=await post({poseResultId:source.id},key);assert.equal(r.status(),503);assert.ok(!(await r.text()).includes('private SQL'));assert.equal((await stack.progressDb.query('SELECT id FROM workout_logs WHERE pose_result_id=$1',[source.id])).rows.length,0);assert.equal((await stack.progressDb.query('SELECT key FROM progress_idempotency WHERE key=$1',[key])).rows.length,0);}finally{await stack.progressDb.query('DROP TRIGGER fail_pose_set ON log_sets');await stack.progressDb.query('DROP FUNCTION fail_pose_set()');}
    assert.equal((await post({poseResultId:source.id},key)).status(),201);
  });
  await t.test('delete scrubs snapshot, preserves result reservation and same-key tombstone through receipt expiry',async()=>{
    const source=await seed(),key=randomUUID(),input={poseResultId:source.id},r=await post(input,key),log=await r.json();assert.equal(r.status(),201);assert.equal((await c.delete('/api/v1/progress/logs/'+log.id,{headers:{'If-Match':r.headers().etag}})).status(),204);
    assert.equal((await post(input,key)).status(),410);assert.equal((await post(input)).status(),409);await stack.progressDb.query('UPDATE progress_idempotency SET expires_at=now()-interval \'1 second\' WHERE key=$1',[key]);assert.equal((await post(input,key)).status(),409);
    const stored=(await stack.progressDb.query('SELECT source_snapshot FROM workout_logs WHERE id=$1',[log.id])).rows[0];assert.deepEqual(stored.source_snapshot,{});
  });
  await t.test('committed replay and duplicate still resolve when Pose is offline; new import fails closed, old logs work',async()=>{
    const source=await seed();await stack.poseSummary.stop();const replay=await post(retainedInput,retainedKey);assert.equal(replay.status(),201);assert.deepEqual(await replay.json(),created);const duplicate=await post(retainedInput);assert.equal(duplicate.status(),409);assert.equal((await duplicate.json()).detail,'/api/v1/progress/logs/'+created.id);assert.equal((await post({poseResultId:source.id})).status(),503);assert.equal((await c.get('/api/v1/progress/logs/'+created.id)).status(),200);
  });
});
