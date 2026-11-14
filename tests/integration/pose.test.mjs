import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { request } from 'node:https';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { join, resolve, sep } from 'node:path';
import { randomUUID, randomBytes, createHash, generateKeyPairSync } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { startPostgres, freePort } from '../helpers/postgres.mjs';
import { startMediaTools } from '../helpers/media-stack.mjs';
import { startProcess } from '../helpers/processes.mjs';
import { createTestTls } from '../../backend/apps/identity/test/tls.cjs';
import { createApp as createIdentity } from '../../backend/apps/identity/dist/app.js';
import { IdentityKeys, hashSecret } from '../../backend/apps/identity/dist/modules/accounts/crypto.js';
import { migrate as migrateIdentity } from '../../backend/apps/identity/dist/migrate.js';
import { connectDatabase } from '../../backend/apps/pose/dist/database.js';
import { migrate } from '../../backend/apps/pose/dist/migrate.js';
import { PoseStorage } from '../../backend/apps/pose/dist/modules/analysis/storage.js';
import { PoseWorker } from '../../backend/apps/pose/dist/modules/analysis/worker.js';
import { EngineHttp } from '../../backend/apps/pose/dist/engine.js';
import { models } from '../../backend/apps/pose/dist/contract.js';
import { aiDirectory, localAIEnv } from '../../scripts/ai-local-env.mjs';
// Resolve the workspace cache before Playwright evaluates its browser registry.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.local/browsers');
const {chromium,expect}=await import('@playwright/test');
const WebSocket = createRequire(new URL('../../frontend/package.json', import.meta.url))('ws');
const { PutBucketCorsCommand } = createRequire(new URL('../../backend/apps/pose/package.json', import.meta.url))('@aws-sdk/client-s3');

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
test('Pose upload and live lifecycle over real PostgreSQL, S3 and mTLS', { timeout: 240000 }, async t => {
  const cleanup = [];
  t.after(async () => {
    const errors = [];
    for (const close of cleanup.reverse()) try { await close(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Pose fixture cleanup failed');
  });
  const pg = await startPostgres(); cleanup.push(pg.stop); t.diagnostic(pg.version);
  const db = connectDatabase(pg.connectionString); cleanup.push(() => db.close());
  await migrate(db); await migrate(db);
  const tools = await startMediaTools(); cleanup.push(tools.stop);
  const storage = new PoseStorage(tools.client, tools.bucket);
  const tls = await createTestTls(); cleanup.push(tls.stop);
  const issuer = 'https://identity.test';
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  const keys = new IdentityKeys(key, 'pose-test', issuer, randomBytes(32), randomBytes(32));
  await db.query('CREATE DATABASE pose_test_identity');
  const identityUrl = new URL(pg.connectionString); identityUrl.pathname = '/pose_test_identity';
  const identityDb = connectDatabase(identityUrl.toString()); cleanup.push(() => identityDb.close());
  await migrateIdentity(identityDb);
  const { app: identity } = await createIdentity(identityDb,
    { keys, webOrigin: 'https://gym.test', callers: tls.callers, tls: { ...tls.clients.server, ca: tls.ca } });
  await identity.listen(0, '127.0.0.1'); cleanup.push(() => identity.close());
  const port = await freePort();
  const config = { DATABASE_URL: pg.connectionString, POSE_HOST: '127.0.0.1', POSE_PORT: String(port), POSE_UPLOAD_ENABLED: 'true',
    POSE_CONSENT_VERSION: 'pose-v1', POSE_BFF_FINGERPRINTS: JSON.stringify(tls.callers.bff),
    // Fixture aliases only: notification acts as Progress, catalog as Pose outbound JWKS identity.
    POSE_PROGRESS_FINGERPRINTS: JSON.stringify(tls.callers.notification),
    POSE_TLS_KEY_FILE: join(tls.directory,'server.key'), POSE_TLS_CERT_FILE: join(tls.directory,'server.crt'), POSE_TLS_CA_FILE: join(tls.directory,'ca.crt'),
    POSE_IDENTITY_ORIGIN: 'https://127.0.0.1:' + identity.getHttpServer().address().port, POSE_IDENTITY_ISSUER: issuer,
    POSE_IDENTITY_TLS_KEY_FILE: join(tls.directory,'catalog.key'), POSE_IDENTITY_TLS_CERT_FILE: join(tls.directory,'catalog.crt'), POSE_IDENTITY_TLS_CA_FILE: join(tls.directory,'ca.crt'),
    POSE_S3_ENDPOINT: tools.endpoint, POSE_S3_BUCKET: tools.bucket, POSE_S3_REGION: 'us-east-1', POSE_S3_PREFIX: 'tests/pose',
    AWS_ACCESS_KEY_ID: tools.credentials.accessKeyId, AWS_SECRET_ACCESS_KEY: tools.credentials.secretAccessKey };
  const api = startProcess(['dist/main.js'], 'backend/apps/pose', config); cleanup.push(() => api.stop());
  const apiSchema = JSON.parse(await readFile('docs/api/openapi.yaml', 'utf8'));
  const ajv = new Ajv2020({ strict: false }); addFormats(ajv); ajv.addSchema({ $id: 'api', components: apiSchema.components });
  const userA = randomUUID(), userB = randomUUID(), admin = randomUUID();
  const token = (owner = userA, role = 'USER') => keys.assertion(owner, role, new Date(), new Date(Date.now()+300000)).accessToken;
  function call(path, { method = 'GET', body, owner = userA, role = 'USER', caller = 'bff', auth = token(owner, role), headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path, method, ...(caller ? tls.clients[caller] : {}), ca: tls.ca,
        agent: false, signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer '+auth } : {}), ...headers } }, res => {
        let data=''; res.setEncoding('utf8'); res.on('data', c => { data+=c; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data ? JSON.parse(data) : null }));
      }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  async function checked(path, options = {}, expected = 200, schema) {
    const r = await call(path, options); assert.equal(r.status, expected, JSON.stringify(r.body));
    assert.equal(r.headers['cache-control'], 'no-store');
    if (schema || expected >= 400) { const validate=ajv.getSchema('api#/components/schemas/'+(schema ?? 'Problem')); assert.equal(validate(r.body),true,JSON.stringify(validate.errors)); }
    return r;
  }
  let ready=false;
  for(let i=0;i<80;i++){ try { if((await call('/health/ready')).status===200){ready=true;break;} }catch{} await delay(100); }
  assert.ok(ready, 'Pose process did not become ready');
  const post = (body, owner = userA, operationKey = randomUUID()) => ({ method: 'POST', owner, body, headers: { 'idempotency-key': operationKey } });
  const input = bytes => ({ mimeType: 'video/mp4', sizeBytes: bytes.length, sha256: sha(bytes), consentVersion: 'pose-v1' });
  const tempBase=resolve('.local/pose-tests'); await mkdir(tempBase,{recursive:true}); const temp=await mkdtemp(join(tempBase,'run-'));
  cleanup.push(async()=>{assert.ok(temp.startsWith(tempBase+sep));await rm(temp,{recursive:true,force:true});});
  const workerTools={ffmpeg:tools.ffmpeg,ffprobe:tools.ffprobe,temp};
  async function uploaded(bytes=tools.video, owner=randomUUID()) {
    const grant=(await checked('/api/v1/pose/uploads',post(input(bytes),owner),201,'PoseUpload')).body;
    const put=await fetch(grant.putUrl,{method:'PUT',headers:grant.headers,body:bytes});assert.equal(put.status,200,await put.text());
    return {grant,owner};
  }
  async function queued(bytes=tools.video,owner=randomUUID(),exerciseId='bodyweight_squat') {
    const u=await uploaded(bytes,owner);const r=await checked('/api/v1/pose/jobs',post({uploadId:u.grant.uploadId,exerciseId,consentVersion:'pose-v1'},owner),202,'PoseJob');
    return {...u,job:r.body};
  }
  const syntheticRaw = () => { const m=models[0];return {exercise:m.poseId,schema_version:m.schemaVersion,scope:'video',quality:{usable:true},label_results:m.labels.map(l=>({...l,probability:0}))}; };
  const fakeEngine = { ready: async()=>{}, analyze:async()=>syntheticRaw() };
  const worker = engine => new PoseWorker(db,storage,engine ?? fakeEngine,workerTools);
  async function cancelPending(){for(const r of (await db.query("SELECT id,owner_id FROM pose_jobs WHERE status IN ('QUEUED','RUNNING')")).rows)await checked('/api/v1/pose/jobs/'+r.id+'/cancel',post(undefined,r.owner_id));}
  const signal=()=>AbortSignal.timeout(30000);

  await t.test('mTLS, caller ACL, Identity assertions and strict inputs protect every private resource',async()=>{
    await assert.rejects(call('/health/ready',{caller:null}));
    await checked('/health/ready',{caller:'unknown'},403);
    await checked('/api/v1/pose/uploads',{...post(input(tools.video)),auth:null},401);
    await checked('/api/v1/pose/uploads',{...post(input(tools.video)),caller:'notification'},403);
    await checked('/api/v1/pose/uploads',post({...input(tools.video),ownerUserId:userB}),422);
    await checked('/api/v1/pose/uploads',post({...input(tools.video),consentVersion:'old'}),422);
    await checked('/api/v1/pose/uploads',post({...input(tools.video),sizeBytes:104857601}),422);
    await checked('/api/v1/pose/capabilities',{},200,'PoseCapabilityList');
  });
  await t.test('upload reservation replays without storing signed URL and bounds PUT constraints',async()=>{
    const opts=post(input(tools.video),userA);const a=await checked('/api/v1/pose/uploads',opts,201,'PoseUpload');
    const b=await checked('/api/v1/pose/uploads',opts,201);assert.equal(a.body.uploadId,b.body.uploadId);
    assert.equal(JSON.stringify((await db.query('SELECT response FROM pose_idempotency WHERE owner_id=$1',[userA])).rows).includes('X-Amz-'),false);
    await checked('/api/v1/pose/uploads',{...opts,body:{...input(tools.video),sizeBytes:1}},409);
    const upload=await fetch(a.body.putUrl,{method:'PUT',headers:a.body.headers,body:tools.video});assert.equal(upload.status,200);
    assert.ok((await fetch(a.body.putUrl,{method:'PUT',headers:a.body.headers,body:tools.video})).status>=400);
    assert.ok((await fetch(a.body.putUrl,{signal:AbortSignal.timeout(3000)})).status>=400);
  });
  await t.test('two job creates and duplicate upload hashes produce one owned job',async()=>{
    const u=await uploaded(tools.video,userA);const opts=post({uploadId:u.grant.uploadId,exerciseId:'bodyweight_squat',consentVersion:'pose-v1'},userA);
    const [a,b]=await Promise.all([call('/api/v1/pose/jobs',opts),call('/api/v1/pose/jobs',opts)]);
    assert.equal(a.status,202);assert.equal(b.status,202);assert.equal(a.body.id,b.body.id);
    const duplicate=await queued(tools.video,userA);assert.equal(duplicate.job.id,a.body.id);
    await checked('/api/v1/pose/jobs/'+a.body.id,{owner:userB},404);
    await checked('/api/v1/pose/jobs/'+a.body.id,{owner:admin,role:'ADMIN'},404);
    await checked('/api/v1/pose/jobs',post({...opts.body,exerciseId:'push_up'},userA),409);
    await checked('/api/v1/pose/jobs/'+a.body.id+'/cancel',post(undefined,userB),404);
    const canceled=(await checked('/api/v1/pose/jobs/'+a.body.id+'/cancel',post())).body;
    assert.deepEqual((await checked('/api/v1/pose/jobs/'+a.body.id+'/cancel',post())).body,canceled);
  });
  await t.test('worker commits summary/raw/provenance atomically; raw and summary have distinct caller ACLs',async()=>{
    const q=await queued();await cancelPending();
    // This isolated synthetic dependency test is separate from the real-engine case below.
    await db.query("UPDATE pose_jobs SET status='QUEUED' WHERE id=$1",[q.job.id]);
    assert.equal(await worker().runNext(signal()),true);
    const done=(await checked('/api/v1/pose/jobs/'+q.job.id,{owner:q.owner},200,'PoseJob')).body;
    assert.equal(done.status,'SUCCEEDED');assert.equal(done.result.repCount,null);assert.equal(done.result.repCountStatus,'UNAVAILABLE');
    const path='/internal/v1/pose/results/'+done.result.id;
    const raw=await checked(path+'/raw',{owner:q.owner},200,'PoseRawResultEnvelope');
    assert.equal(raw.body.sourceId,'sha256:'+sha(tools.video));assert.equal(raw.body.rawModelResult.label_results.length,14);
    await checked(path+'/raw',{owner:userB},404);await checked(path+'/raw',{owner:q.owner,caller:'notification'},403);
    await checked(path,{owner:q.owner},403);await checked(path+'/',{owner:q.owner},403);
    await checked(path,{owner:q.owner,caller:'notification'},200,'PoseResult');
    await assert.rejects(db.query("UPDATE pose_results SET raw_model_result='{}' WHERE id=$1",[done.result.id]),/immutable/);
  });
  await t.test('expired dispatched lease becomes UNKNOWN without running inference again; cancellation fences late completion',async()=>{
    const q=await queued();const w=worker();const claim=await w.claim();assert.equal(claim.id,q.job.id);
    await db.query("UPDATE pose_jobs SET dispatched_at=now(),lease_until=now()-interval '1 second' WHERE id=$1",[q.job.id]);
    assert.equal(await w.claim(),null);
    const failed=(await checked('/api/v1/pose/jobs/'+q.job.id,{owner:q.owner})).body;
    assert.equal(failed.failureCode,'INFERENCE_OUTCOME_UNKNOWN');
    const late=await queued();let entered;const started=new Promise(r=>entered=r);let release;const finish=new Promise(r=>release=r);
    const running=worker({ready:async()=>{},analyze:async()=>{entered();await finish;return syntheticRaw();}}).runNext(signal());
    await started;await checked('/api/v1/pose/jobs/'+late.job.id+'/cancel',post(undefined,late.owner));release();await running;
    assert.equal((await checked('/api/v1/pose/jobs/'+late.job.id,{owner:late.owner})).body.status,'CANCELED');
    assert.equal((await db.query('SELECT id FROM pose_results WHERE job_id=$1',[late.job.id])).rows.length,0);
  });
  await t.test('byte validation, provider outage and malformed result never produce a successful result',async()=>{
    const bad=await queued(Buffer.from('not a video'));await worker().runNext(signal());
    assert.equal((await checked('/api/v1/pose/jobs/'+bad.job.id,{owner:bad.owner})).body.failureCode,'VIDEO_INVALID');
    const unavailable=await queued();await worker({ready:async()=>{throw Error('private dependency detail');},analyze:async()=>{throw Error('must not dispatch');}}).runNext(signal());
    assert.equal((await checked('/api/v1/pose/jobs/'+unavailable.job.id,{owner:unavailable.owner})).body.status,'QUEUED');
    await cancelPending();const unknown=await queued();await worker({ready:async()=>{},analyze:async()=>{throw Error('timeout after send');}}).runNext(signal());
    assert.equal((await checked('/api/v1/pose/jobs/'+unknown.job.id,{owner:unknown.owner})).body.failureCode,'INFERENCE_OUTCOME_UNKNOWN');
    const malformed=await queued();await worker({ready:async()=>{},analyze:async()=>({})}).runNext(signal());
    assert.equal((await checked('/api/v1/pose/jobs/'+malformed.job.id,{owner:malformed.owner})).body.status,'FAILED');
  });
  await t.test('real Pose engine is protected by its own mTLS CA and independent worker runs actual inference',async st=>{
    const source=process.env.POSE_TEST_SOURCE_ROOT;
    if(!source){st.skip('Set POSE_TEST_SOURCE_ROOT and prepare T21 runtime for real inference');return;}
    const engineTls=await createTestTls();cleanup.push(engineTls.stop);const enginePort=await freePort();
    const python=spawn(join(aiDirectory,'pose-env/Scripts/python.exe'),['-B','backend/apps/pose/engine/main.py','--source',source,'--port',String(enginePort),
      '--key',join(engineTls.directory,'server.key'),'--cert',join(engineTls.directory,'server.crt'),'--ca',join(engineTls.directory,'ca.crt')],{cwd:resolve('.'),env:await localAIEnv(),windowsHide:true});
    let logs='';python.stdout.on('data',b=>{logs=(logs+b).slice(-5000);});python.stderr.on('data',b=>{logs=(logs+b).slice(-5000);});
    cleanup.push(async()=>{if(python.exitCode===null&&python.signalCode===null)await new Promise(r=>{python.once('exit',r);python.kill();});});
    const engine=new EngineHttp('https://127.0.0.1:'+enginePort,{...engineTls.clients.bff,ca:engineTls.ca});
    let engineReady=false;for(let i=0;i<180;i++){if(python.exitCode!==null)throw Error(logs);try{await engine.ready(AbortSignal.timeout(500));engineReady=true;break;}catch{}await delay(200);}
    assert.ok(engineReady,'Engine not ready: '+logs);
    await assert.rejects(new EngineHttp(engine.origin,{...tls.clients.bff,ca:engineTls.ca}).ready(AbortSignal.timeout(3000)));
    const files=(await readdir(join(source,'smart_gym_test_rtmpose_v4/test_videos_benchmark/squats'))).filter(n=>n.startsWith('CORRECT_')&&n.endsWith('.mp4')).sort();
    const video=await readFile(join(source,'smart_gym_test_rtmpose_v4/test_videos_benchmark/squats',files[0]));
    const q=await queued(video);
    const engineConfig = { POSE_ENGINE_ORIGIN:engine.origin,
      POSE_ENGINE_TLS_KEY_FILE:join(engineTls.directory,'bff.key'),POSE_ENGINE_TLS_CERT_FILE:join(engineTls.directory,'bff.crt'),POSE_ENGINE_TLS_CA_FILE:join(engineTls.directory,'ca.crt'),
      POSE_FFMPEG:tools.ffmpeg,POSE_FFPROBE:tools.ffprobe,POSE_TEMP_DIR:temp };
    const workerProcess=startProcess(['dist/worker-main.js'],'backend/apps/pose',{...config,...engineConfig});cleanup.push(()=>workerProcess.stop());
    try {
      let result;for(let i=0;i<600;i++){result=(await checked('/api/v1/pose/jobs/'+q.job.id,{owner:q.owner})).body;if(!['QUEUED','RUNNING'].includes(result.status))break;await delay(100);}
      assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.equal(result.result.repCount,null);
      await checked('/internal/v1/pose/results/'+result.result.id+'/raw',{owner:q.owner},200,'PoseRawResultEnvelope');
    }finally{await workerProcess.stop();}

    await st.test('live browser contract through BFF and real V4, including cookie revocation and connection fencing', async liveTest => {
      const livePort = await freePort(), bffPort = await freePort(), webOrigin = 'https://127.0.0.1:' + bffPort;
      const liveApi = startProcess(['dist/main.js'], 'backend/apps/pose', { ...config, ...engineConfig, POSE_PORT: String(livePort), POSE_LIVE_ENABLED: 'true' });
      cleanup.push(() => liveApi.stop());
      const identityEnv = { BFF_AUTH_ENABLED: 'true', AUTH_SECRET: randomBytes(32).toString('base64url'), BFF_WEB_ORIGIN: webOrigin, BFF_IDENTITY_ORIGIN: config.POSE_IDENTITY_ORIGIN,
        BFF_IDENTITY_KEY_FILE: join(tls.directory,'bff.key'), BFF_IDENTITY_CERT_FILE: join(tls.directory,'bff.crt'), BFF_IDENTITY_CA_FILE: join(tls.directory,'ca.crt') };
      async function issueSession(owner) {
        const handle = randomBytes(32).toString('base64url'), session = randomUUID();
        await identityDb.transaction(async client => {
          const email = owner + '@pose.test';
          await client.query(`INSERT INTO users(id,email,email_normalized,display_name,status,email_verified_at,created_at,updated_at)
            VALUES($1,$2,$2,'Pose Fixture','ACTIVE',now(),now(),now()) ON CONFLICT DO NOTHING`,[owner,email]);
          await client.query(`INSERT INTO credentials(user_id,password_hash,password_changed_at) VALUES($1,'fixture-unused',now()) ON CONFLICT DO NOTHING`,[owner]);
          await client.query(`INSERT INTO sessions(id,user_id,secret_hash,expires_at,last_seen_at,created_at,credential_version)
            VALUES($1,$2,$3,now()+interval '1 hour',now(),now(),1)`,[session,owner,hashSecret(handle)]);
        });
        return { session, cookie: '__Host-sg_session=' + handle };
      }
      const first = await issueSession(userA), other = await issueSession(userB);
      const web = startProcess(['server.mjs'],'frontend',{...identityEnv,HOST:'127.0.0.1',PORT:String(bffPort),BFF_POSE_LIVE_ENABLED:'true',BFF_POSE_RECHECK_MS:'1000',
        BFF_WEB_KEY_FILE:join(tls.directory,'server.key'),BFF_WEB_CERT_FILE:join(tls.directory,'server.crt'),
        BFF_POSE_ORIGIN:'https://127.0.0.1:'+livePort,BFF_POSE_TLS_KEY_FILE:join(tls.directory,'bff.key'),
        BFF_POSE_TLS_CERT_FILE:join(tls.directory,'bff.crt'),BFF_POSE_TLS_CA_FILE:join(tls.directory,'ca.crt'),BFF_POSE_UPLOAD_ORIGIN:tools.endpoint});
      cleanup.push(() => web.stop());
      const clients = [];
      cleanup.push(async () => { for (const ws of clients) ws.terminate(); });
      const root = '/api/v1/pose/live-sessions';
      const http = (path,{ cookie = first.cookie, method = 'GET', body, origin = webOrigin, key = randomUUID() } = {}) => new Promise((resolve,reject) => {
        const req = request(new URL(path,webOrigin),{ca:tls.ca,agent:false,method,signal:AbortSignal.timeout(5000),
          headers:{cookie,origin,'content-type':'application/json','x-smartgym-csrf':'1','idempotency-key':key}},res=>{
          let data='';res.on('data',chunk=>{data+=chunk;});res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(data)}));
        });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
      });
      const input = { exerciseId:'bodyweight_squat', consentVersion:'pose-v1' };
      const create = opts => http(root,{method:'POST',body:input,...opts});
      let liveReady = false;
      for(let i=0;i<150;i++){ try { const r=await http(root+'/'+randomUUID()); if(r.status===404){liveReady=true;break;} } catch {} await delay(100); }
      assert.ok(liveReady,'Live Pose did not start');
      // Exercise Next's normal request handler before opening a Pose upgrade.
      const pageStatus = await new Promise((resolve,reject) => {
        const req=request(new URL('/dang-nhap',webOrigin),{ca:tls.ca,agent:false,signal:AbortSignal.timeout(5000)},res=>{res.resume();resolve(res.statusCode);});
        req.on('error',reject);req.end();
      });
      assert.equal(pageStatus,200);
      function connect(path,{ cookie = first.cookie, origin = webOrigin, protocol = 'smartgym.pose.v1', expected = 101 } = {}) {
        return new Promise((resolve,reject) => {
          const ws = new WebSocket(new URL(path,webOrigin.replace('https:','wss:')),protocol,{ca:tls.ca,origin,headers:{cookie},handshakeTimeout:10000});
          clients.push(ws);
          const messages = [];
          ws.on('message',bytes=>messages.push(JSON.parse(bytes)));
          ws.on('error',reject);
          ws.once('open',()=>{if(expected!==101)reject(Error('Unexpected upgrade'));else resolve({ws,messages});});
          ws.once('unexpected-response',(_,res)=>{
            res.resume();
            if(res.statusCode!==expected){reject(Error(`Expected ${expected}, got ${res.statusCode}`));return;}
            resolve(null);
          });
        });
      }
      async function waitFor(check, message, timeout = 15000) {
        const end = Date.now()+timeout;
        while(Date.now()<end){ const value=await check(); if(value)return value; await delay(25); }
        throw Error(message);
      }
      assert.equal((await create({origin:'https://other.test'})).status,403);
      const key = randomUUID();
      const created = await create({key}); assert.equal(created.status,201,JSON.stringify(created.body));
      const session = created.body;
      assert.equal((await create({key})).body.id,session.id);
      assert.equal((await create()).status,409);
      assert.equal((await http(root+'/'+session.id,{cookie:other.cookie})).status,404);
      await connect(session.streamPath,{origin:'https://other.test',expected:403});
      await connect(session.streamPath,{cookie:'',expected:401});
      await connect(session.streamPath,{cookie:other.cookie,expected:404});
      await connect(session.streamPath,{protocol:'wrong',expected:400});
      const { ws, messages } = await connect(session.streamPath);
      await waitFor(()=>messages.find(m=>m.type==='ready'),`Missing live readiness ${JSON.stringify(messages)}`);
      await connect(session.streamPath,{expected:409});

      const framesDir = await mkdtemp(join(tools.directory,'frames-'));
      const clips=(await readdir(join(source,'smart_gym_test_rtmpose_v4/test_videos_benchmark/squats'))).filter(n=>n.endsWith('.mp4')).sort();
      await promisify(execFile)(tools.ffmpeg,['-nostdin','-loglevel','error','-i',join(source,'smart_gym_test_rtmpose_v4/test_videos_benchmark/squats',clips[0]),
        '-vf','fps=10,scale=640:480:force_original_aspect_ratio=decrease','-threads','1',join(framesDir,'%03d.jpg')],{windowsHide:true,timeout:20000});
      const images = (await readdir(framesDir)).sort(); assert.ok(images.length >= 20);
      for (let index=0;index<images.length;index++) {
        const header=Buffer.alloc(12);header.writeUInt32BE(index+1);header.writeBigUInt64BE(BigInt(index*100),4);
        ws.send(Buffer.concat([header,await readFile(join(framesDir,images[index]))]));
        if(index===0){
          await waitFor(()=>messages.find(m=>m.type==='ack'&&m.frameSeq===1),'First frame was not acknowledged');
          const duplicate=Buffer.alloc(13);duplicate.writeUInt32BE(1);ws.send(duplicate);
          await waitFor(()=>messages.find(m=>m.type==='warning'&&m.code==='LIVE_STALE_FRAME'),'Stale frame not rejected');
        }
        await delay(103);
      }
      await delay(500); ws.send(JSON.stringify({type:'finish'}));
      const finished=await waitFor(()=>messages.find(m=>m.type==='finished'),'Finish failed: '+JSON.stringify(messages.slice(-4)));
      const done=(await http(root+'/'+session.id)).body;
      assert.equal(done.status,'COMPLETED'); assert.equal(done.result.id,finished.resultId);
      assert.equal(done.result.repCountStatus,'AVAILABLE'); assert.ok(done.result.repCount >= 1,JSON.stringify(done.result));
      assert.equal(done.result.reps.length,done.result.repCount);
      const raw=(await db.query('SELECT raw_model_result FROM pose_results WHERE id=$1',[finished.resultId])).rows[0].raw_model_result;
      assert.ok(raw?.source?.live_session_sha256 && ['window','rep'].includes(raw.scope));
      const rawPath='/internal/v1/pose/results/'+finished.resultId+'/raw';
      await checked(rawPath,{},200,'PoseRawResultEnvelope');
      await checked(rawPath,{owner:userB},404);

      const expires = await create({cookie:other.cookie}); assert.equal(expires.status,201);
      await db.query("UPDATE pose_live_sessions SET expires_at=now()-interval '1 second' WHERE id=$1",[expires.body.id]);
      await connect(expires.body.streamPath,{cookie:other.cookie,expected:410});
      assert.equal((await http(root+'/'+expires.body.id,{cookie:other.cookie})).body.status,'EXPIRED');
      const disconnected=await create({cookie:other.cookie}); assert.equal(disconnected.status,201);
      const third=await connect(disconnected.body.streamPath,{cookie:other.cookie});
      await waitFor(()=>third.messages.find(m=>m.type==='ready'),'Missing readiness for disconnect');
      third.ws.terminate();
      await waitFor(async()=> (await http(root+'/'+disconnected.body.id,{cookie:other.cookie})).body.status==='FAILED','Disconnected session did not fail');

      const oversized=await create({cookie:other.cookie}); assert.equal(oversized.status,201);
      const limited=await connect(oversized.body.streamPath,{cookie:other.cookie});
      await waitFor(()=>limited.messages.find(m=>m.type==='ready'),'Missing readiness for limit check');
      const limitedClosed=new Promise(resolve=>limited.ws.once('close',resolve));
      limited.ws.send(Buffer.alloc(262145));
      assert.equal(await Promise.race([limitedClosed,delay(5000,'timeout',{ref:false})]),1009);
      await waitFor(async()=> (await http(root+'/'+oversized.body.id,{cookie:other.cookie})).body.status==='FAILED','Oversized message did not fail session');

      const noFrames=await create({cookie:other.cookie}); assert.equal(noFrames.status,201);
      const empty=await connect(noFrames.body.streamPath,{cookie:other.cookie});
      await waitFor(()=>empty.messages.find(m=>m.type==='ready'),'Missing readiness for empty finish');
      empty.ws.send(JSON.stringify({type:'finish'}));
      const emptyFinished=await waitFor(()=>empty.messages.find(m=>m.type==='finished'),'Empty session did not finish');
      const emptyResult=(await http(root+'/'+noFrames.body.id,{cookie:other.cookie})).body.result;
      assert.equal(emptyResult.repCount,null); assert.equal(emptyResult.repCountStatus,'UNAVAILABLE');
      await checked('/internal/v1/pose/results/'+emptyFinished.resultId+'/raw',{owner:userB},422);
      const revocable = await create(); assert.equal(revocable.status,201);
      const second = await connect(revocable.body.streamPath);
      await waitFor(()=>second.messages.find(m=>m.type==='ready'),'Missing readiness for revocation');
      const closed = new Promise(resolve=>second.ws.once('close',resolve));
      await identityDb.query('UPDATE sessions SET revoked_at=now() WHERE id=$1',[first.session]);
      assert.equal(await Promise.race([closed,delay(5000,'timeout', { ref:false })]),1008);
      await waitFor(async()=> (await db.query('SELECT status FROM pose_live_sessions WHERE id=$1',[revocable.body.id])).rows[0]?.status==='FAILED','Revoked session was not finalized as failed');
      assert.equal((await http(root+'/'+revocable.body.id)).status,401);
      assert.ok(resolve(framesDir).startsWith(resolve(tools.directory)+sep));
      await rm(framesDir,{recursive:true,force:true});

      if (process.env.POSE_TEST_BROWSER === 'true') {
        await liveTest.test('training screen uploads real video and releases browser camera tracks',async()=>{
          await tools.client.send(new PutBucketCorsCommand({Bucket:tools.bucket,CORSConfiguration:{CORSRules:[{
            AllowedOrigins:[webOrigin],AllowedMethods:['PUT'],AllowedHeaders:['content-type','if-none-match','x-amz-checksum-sha256'],MaxAgeSeconds:60,
          }]} }), {abortSignal:AbortSignal.timeout(5000)});
          const y4m=join(tools.directory,'camera.y4m');
          const realClip=join(source,'smart_gym_test_rtmpose_v4/test_videos_benchmark/squats',clips[0]);
          await promisify(execFile)(tools.ffmpeg,['-nostdin','-loglevel','error','-i',realClip,
            '-vf','fps=10,scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2','-pix_fmt','yuv420p','-threads','1',y4m],{windowsHide:true,timeout:20000});
          process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.local/browsers');
          const browser=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-video-capture='+y4m]});
          let uiWorker;
          try {
            const context=await browser.newContext({ignoreHTTPSErrors:true,permissions:['camera'],viewport:{width:390,height:844}});
            const owner=randomUUID(), auth=await issueSession(owner);
            await context.addCookies([{name:'__Host-sg_session',value:auth.cookie.split('=')[1],url:webOrigin,secure:true,httpOnly:true,sameSite:'Lax'}]);
            const page=await context.newPage();
            let stopped=0;
            await page.exposeFunction('recordCameraStop',()=>{stopped++;});
            await page.addInitScript(()=>{
              const original=MediaStreamTrack.prototype.stop;
              MediaStreamTrack.prototype.stop=function(){if(this.kind==='video'&&this.readyState==='live')void window.recordCameraStop();return original.call(this);};
            });
            await page.goto(webOrigin+'/app/tap-ai');
            await expect(page.getByRole('heading',{name:'Tập cùng AI'})).toBeVisible();
            await expect(page.getByRole('button',{name:'Bắt đầu camera'})).toBeDisabled();
            await page.getByRole('checkbox').check();
            await page.getByRole('radio',{name:'Tải video'}).check();
            const picker=page.getByLabel('Video MP4 hoặc WebM');
            const errors=[];page.on('console',entry=>{if(entry.type()==='error')errors.push(entry.text().replace(/https?:\/\/\S+/g,'[url]'));});
            await picker.setInputFiles({name:'cancel.mp4',mimeType:'video/mp4',buffer:tools.video});
            await page.getByRole('button',{name:'Phân tích video'}).click();
            await expect(page.getByRole('button',{name:'Hủy phân tích'}),errors.join('\n')).toBeVisible({timeout:15000});
            await page.getByRole('button',{name:'Hủy phân tích'}).click();
            await expect(page.getByText('Đã hủy yêu cầu phân tích.')).toBeVisible();
            uiWorker=startProcess(['dist/worker-main.js'],'backend/apps/pose',{...config,...engineConfig});
            await picker.setInputFiles({name:'squat.mp4',mimeType:'video/mp4',buffer:video});
            await page.getByRole('button',{name:'Phân tích video'}).click();
            await expect(page.getByRole('heading',{name:'Kết quả phân tích'})).toBeVisible({timeout:45000});
            await expect(page.getByText('Chưa có số rep',{exact:true})).toBeVisible();
            const detail=await page.getByRole('link',{name:'Mở chi tiết kết quả'}).getAttribute('href');
            await page.getByRole('link',{name:'Mở chi tiết kết quả'}).click();
            await expect(page.getByRole('heading',{name:'Kết quả phân tích'})).toBeVisible();
            const otherContext=await browser.newContext({ignoreHTTPSErrors:true});
            await otherContext.addCookies([{name:'__Host-sg_session',value:other.cookie.split('=')[1],url:webOrigin,secure:true,httpOnly:true,sameSite:'Lax'}]);
            const otherPage=await otherContext.newPage();await otherPage.goto(webOrigin+detail);
            await expect(otherPage.getByRole('alert').filter({hasText:'Không tìm thấy kết quả'})).toBeVisible();await otherContext.close();
            await page.getByRole('link',{name:'Về màn hình tập AI'}).click();
            await page.getByRole('checkbox').check();
            await page.getByRole('button',{name:'Bắt đầu camera'}).click();
            await expect(page.getByRole('button',{name:'Kết thúc phiên'})).toBeVisible({timeout:15000});
            await expect(page.getByText(/Số rep: [1-9]/)).toBeVisible({timeout:16000});
            await page.getByRole('button',{name:'Kết thúc phiên'}).click();
            await expect(page.getByRole('heading',{name:'Kết quả phân tích'})).toBeVisible({timeout:18000});
            assert.equal(stopped,1);
            await page.getByRole('button',{name:'Bắt đầu camera'}).click();
            await expect(page.getByRole('button',{name:'Kết thúc phiên'})).toBeVisible({timeout:15000});
            await page.getByRole('link',{name:'Về tài khoản'}).click();
            await expect(page.getByRole('heading',{name:'Tài khoản của bạn'})).toBeVisible();
            await expect.poll(()=>stopped).toBe(2);
            await context.close();
          } finally { await uiWorker?.stop();await browser.close(); }
        });
      }
    });
  });
  await t.test('retention waits for PUT expiry, purges raw object and expires owner result',async()=>{
    await cancelPending();
    await db.query("UPDATE pose_uploads SET put_expires_at=now()-interval '1 minute'");
    while(await worker().collectNext(signal())){}
    assert.equal((await db.query('SELECT id FROM pose_uploads WHERE deleted_at IS NULL')).rows.length,0);
    const r=(await db.query('SELECT id,job_id,owner_id FROM pose_results LIMIT 1')).rows[0];
    await db.query("UPDATE pose_jobs SET expires_at=now()-interval '1 second' WHERE id=$1",[r.job_id]);
    await checked('/api/v1/pose/jobs/'+r.job_id,{owner:r.owner_id},410);
    assert.deepEqual(await readdir(temp),[]);
  });
});
