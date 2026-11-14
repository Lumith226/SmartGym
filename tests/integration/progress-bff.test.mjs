import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer,request } from 'node:https';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createTestTls } from '../../backend/apps/identity/test/tls.cjs';
import { handleProgress } from '../../frontend/server/progress.mjs';

test('Progress BFF transport and schema boundary with explicit TLS upstream fixtures',{timeout:30000},async t=>{
  const tls=await createTestTls(),cleanup=[tls.stop];t.after(async()=>{for(const stop of cleanup.reverse())await stop();});
  let mode='valid',progressCalls=0,last,authCalls=0,revoked=false;
  const token='fixture-assertion-kept-only-on-server',handle='s'.repeat(43),id=randomUUID();
  const log={id,performedAt:'2020-01-01T12:00:00.000Z',sets:[{exerciseId:'bodyweight_squat',exerciseNameVi:'Squat',ordinal:1,repetitions:10,weightKg:20}],source:'MANUAL',version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const identity=createServer({...tls.clients.server,ca:tls.ca,requestCert:true,rejectUnauthorized:true},async(req,res)=>{
    authCalls++;let body='';for await(const chunk of req)body+=chunk;
    assert.equal(req.url,'/internal/v1/identity/sessions/introspect');assert.equal(JSON.parse(body).sessionHandle,handle);
    res.writeHead(revoked?401:200,{'cache-control':'no-store','content-type':'application/json'});
    res.end(JSON.stringify(revoked?{}:{accessToken:token,expiresAt:new Date(Date.now()+60000).toISOString(),userId:randomUUID(),roles:['USER'],emailVerified:true}));
  });await new Promise(r=>identity.listen(0,'127.0.0.1',r));cleanup.push(()=>new Promise(r=>identity.close(r)));
  const upstream=createServer({...tls.clients.server,ca:tls.ca,requestCert:true,rejectUnauthorized:true},async(req,res)=>{
    progressCalls++;let text='';for await(const chunk of req)text+=chunk;last={headers:req.headers,text};
    res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');res.setHeader('etag','"v1"');
    if(mode==='redirect'){res.writeHead(307,{location:'https://evil.test'});res.end();return;}
    if(mode==='private-error'||mode==='overlap'){res.writeHead(409);res.end(JSON.stringify({type:'about:blank',status:409,title:'private-sql',code:mode==='overlap'?'OCCURRENCE_ALREADY_LOGGED':'PRIVATE_SQL',detail:mode==='overlap'?'Nhật ký đã có: /api/v1/progress/logs/'+id:'password=secret',requestId:'fixture'}));return;}
    if(mode==='oversized'){res.end('x'.repeat(2*1024*1024+1));return;}
    if(mode==='etag')res.setHeader('etag','W/"v1"');
    if(req.method==='DELETE'){res.writeHead(204);res.end();return;}
    res.setHeader('set-cookie','private=never-forward');
    if(req.method==='POST'){res.setHeader('location',mode==='location'?'https://evil.test':'/api/v1/progress/logs/'+id);res.writeHead(201);}
    const imported={...log,source:'POSE',poseResultId:id,poseSummary:{id,source:'LIVE',exerciseId:'bodyweight_squat',modelVersion:'fixture-v1',configVersion:'fixture-v1',repCount:10,repCountStatus:'AVAILABLE',formStatus:'INSUFFICIENT_EVIDENCE',completedAt:log.performedAt,expiresAt:new Date(Date.now()+86400000).toISOString()}};
    const output=req.url==='/api/v1/progress/pose-imports'?imported:log;
    res.end(JSON.stringify(mode==='extra'?{...output,accessToken:'PRIVATE_TOKEN'}:mode==='wrong-source'?log:output));
  });await new Promise(r=>upstream.listen(0,'127.0.0.1',r));cleanup.push(()=>new Promise(r=>upstream.close(r)));
  Object.assign(process.env,{BFF_AUTH_ENABLED:'true',BFF_WEB_ORIGIN:'https://web.test',BFF_IDENTITY_ORIGIN:'https://127.0.0.1:'+identity.address().port,
    BFF_PROGRESS_ORIGIN:'https://127.0.0.1:'+upstream.address().port});
  for(const prefix of ['BFF_IDENTITY','BFF_PROGRESS'])for(const [key,file]of Object.entries({KEY:'bff.key',CERT:'bff.crt',CA:'ca.crt'}))process.env[prefix+'_'+key+'_FILE']=join(tls.directory,file);
  const bff=createServer(tls.clients.server,(req,res)=>handleProgress(req,res,'https://web.test'));await new Promise(r=>bff.listen(0,'127.0.0.1',r));cleanup.push(()=>new Promise(r=>bff.close(r)));
  const path='/api/v1/progress/logs/'+id;
  function call(pathname=path,{method='GET',body,headers={},raw}={}){return new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',servername:'localhost',port:bff.address().port,path:pathname,method,agent:false,ca:tls.ca,signal:AbortSignal.timeout(10000),
      headers:{host:'web.test',origin:'https://web.test','x-smartgym-csrf':'1','content-type':'application/json',cookie:'__Host-sg_session='+handle,...headers}},res=>{
        let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text,body:text?JSON.parse(text):null}));
      });req.on('error',reject);req.end(raw??(body===undefined?undefined:JSON.stringify(body)));
  });}
  const input={performedAt:log.performedAt,sets:[{exerciseId:'bodyweight_squat',ordinal:1,repetitions:10,weightKg:20}]};
  await t.test('only server assertion is forwarded; caller cookies and spoofed headers are removed',async()=>{
    const r=await call(path,{headers:{authorization:'Bearer evil','x-user-role':'ADMIN','x-forwarded-for':'203.0.113.1'}});
    assert.equal(r.status,200);assert.deepEqual(r.body,log);assert.equal(r.headers['set-cookie'],undefined);assert.equal(r.headers['cache-control'],'no-store');
    assert.equal(last.headers.authorization,'Bearer '+token);for(const key of ['cookie','x-user-role','x-forwarded-for'])assert.equal(last.headers[key],undefined);
    assert.ok(!r.text.includes(token));
  });
  await t.test('Origin, CSRF, query/header/body validation stop before Progress',async()=>{
    const before=progressCalls;
    assert.equal((await call(path,{method:'PUT',headers:{origin:'https://evil.test'},body:input})).status,403);
    assert.equal((await call(path,{method:'PUT',headers:{'x-smartgym-csrf':'0'},body:input})).status,403);
    assert.equal((await call(path+'?target=https://evil.test')).status,400);
    assert.equal((await call('/api/v1/progress/logs?limit=1&limit=2')).status,400);
    assert.equal((await call('/api/v1/progress/summary')).status,400);
    assert.equal((await call(path,{method:'PUT',body:input})).status,428);
    assert.equal((await call(path,{method:'PUT',body:input,headers:{'if-match':'W/"v1"'}})).status,400);
    assert.equal((await call(path,{method:'PUT',body:{...input,ownerUserId:randomUUID()},headers:{'if-match':'"v1"'}})).status,422);
    assert.equal((await call(path,{method:'PUT',raw:'{broken',headers:{'if-match':'"v1"'}})).status,400);
    assert.equal((await call(path,{method:'PUT',raw:'x'.repeat(66000),headers:{'if-match':'"v1"'}})).status,400);
    assert.equal(progressCalls,before);
  });
  await t.test('unknown route/method cannot proxy arbitrary or internal targets',async()=>{
    const before=progressCalls;
    for(const [p,method]of [['/internal/v1/identity/jwks','GET'],[path,'PATCH'],['/api/v1/progress/logs/not-a-uuid','GET']])assert.equal((await call(p,{method})).status,404);
    assert.equal(progressCalls,before);
  });
  await t.test('revoked and missing sessions fail closed on every request',async()=>{
    const before=progressCalls;revoked=true;assert.equal((await call()).status,401);revoked=false;
    assert.equal((await call(path,{headers:{cookie:''}})).status,401);assert.equal(progressCalls,before);
  });
  await t.test('malformed, oversized, redirected or private upstream data is rejected without retry',async()=>{
    for(mode of ['extra','etag','redirect','oversized']){const before=progressCalls,r=await call();assert.equal(r.status,503,mode);assert.ok(!r.text.includes('PRIVATE_TOKEN'));assert.equal(progressCalls,before+1);assert.equal(r.headers.location,undefined);}mode='valid';
  });
  await t.test('create Location is restricted, 204 works and errors redact upstream internals',async()=>{
    mode='location';assert.equal((await call('/api/v1/progress/logs',{method:'POST',body:input,headers:{'idempotency-key':randomUUID()}})).status,503);
    mode='valid';const created=await call('/api/v1/progress/logs',{method:'POST',body:input,headers:{'idempotency-key':randomUUID()}});assert.equal(created.status,201);assert.equal(created.headers.location,path);
    assert.equal((await call(path,{method:'DELETE',headers:{'if-match':'"v1"'}})).status,204);
    mode='private-error';const privateError=await call(path,{method:'PUT',body:input,headers:{'if-match':'"v1"'}});assert.equal(privateError.status,409);assert.ok(!privateError.text.includes('password'));assert.ok(!privateError.text.includes('private-sql'));
    mode='overlap';const body=input;
    const conflict=await call('/api/v1/progress/logs',{method:'POST',body,headers:{'idempotency-key':randomUUID()}});assert.equal(conflict.status,409);assert.equal(conflict.body.detail,'/api/v1/progress/logs/'+id);assert.ok(authCalls>0);
  });
  await t.test('Pose import checks exact input, source/result identity, canonical log Location and no automatic retry',async()=>{
    mode='valid';const route='/api/v1/progress/pose-imports',options={method:'POST',body:{poseResultId:id},headers:{'idempotency-key':randomUUID()}};
    const r=await call(route,options);assert.equal(r.status,201);assert.equal(r.headers.location,path);assert.equal(r.body.source,'POSE');
    assert.equal((await call(route,{...options,body:{poseResultId:id,repCount:99}})).status,422);
    assert.equal((await call(route,{...options,body:{poseResultId:randomUUID()}})).status,503);
    mode='wrong-source';assert.equal((await call(route,options)).status,503);mode='location';assert.equal((await call(route,options)).status,503);mode='valid';
  });
});
