import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer,request} from 'node:https';import {randomUUID} from 'node:crypto';import {join} from 'node:path';
import {createTestTls} from '../../backend/services/identity/test/tls.cjs';import {handleNotifications} from '../../frontend/server/notifications.mjs';
test('Notification BFF uses explicit mTLS upstream fixtures and validates four contracts',{timeout:30000},async t=>{
  const tls=await createTestTls(),cleanup=[tls.stop];t.after(async()=>{for(const close of cleanup.reverse())await close();});
  let mode='valid',calls=0,last,revoked=false;const token='server-only-fixture-assertion',handle='s'.repeat(43),id=randomUUID(),occurrenceId=randomUUID();
  const prefs={reminderInAppEnabled:true,reminderEmailEnabled:false,leadMinutes:60,version:1},input={reminderInAppEnabled:false,reminderEmailEnabled:true,leadMinutes:15};
  const page={items:[{id,kind:'WORKOUT_REMINDER',title:'Giờ tập',message:'Đã tới giờ tập',occurrenceId,createdAt:new Date().toISOString(),readAt:null}],unreadCount:1,nextCursor:null};
  const identity=createServer({...tls.clients.server,ca:tls.ca,requestCert:true,rejectUnauthorized:true},async(req,res)=>{let text='';for await(const c of req)text+=c;assert.equal(req.url,'/internal/v1/identity/sessions/introspect');assert.equal(JSON.parse(text).sessionHandle,handle);res.writeHead(revoked?401:200,{'cache-control':'no-store','content-type':'application/json'});res.end(JSON.stringify(revoked?{}:{accessToken:token,expiresAt:new Date(Date.now()+60000).toISOString(),userId:randomUUID(),roles:['USER'],emailVerified:true}));});
  await new Promise(r=>identity.listen(0,'127.0.0.1',r));cleanup.push(()=>new Promise(r=>identity.close(r)));
  const upstream=createServer({...tls.clients.server,ca:tls.ca,requestCert:true,rejectUnauthorized:true},async(req,res)=>{
    calls++;let text='';for await(const c of req)text+=c;last={path:req.url,headers:req.headers,body:text?JSON.parse(text):undefined};
    res.setHeader('cache-control',mode==='cache'?'public':'no-store');res.setHeader('content-type','application/json');res.setHeader('set-cookie','private=never-forward');
    if(mode==='redirect'){res.writeHead(307,{location:'https://evil.test'});res.end();return;}
    if(mode==='oversized'){res.end('x'.repeat(2*1024*1024));return;}
    if(mode==='error'){res.writeHead(412);res.end(JSON.stringify({type:'about:blank',status:412,title:'private SQL',code:'VERSION_MISMATCH',detail:'password=secret',requestId:'fixture'}));return;}
    if(req.url.includes('notification-preferences')){res.setHeader('etag',mode==='etag'?'"v2"':'"v1"');res.end(JSON.stringify(mode==='extra'?{...prefs,email:'private@example.test'}:prefs));return;}
    if(req.method==='PUT'){res.writeHead(204);res.end();return;}
    res.end(JSON.stringify(mode==='extra'?{...page,accessToken:'secret'}:mode==='missing'?{items:[],nextCursor:null}:page));
  });await new Promise(r=>upstream.listen(0,'127.0.0.1',r));cleanup.push(()=>new Promise(r=>upstream.close(r)));
  Object.assign(process.env,{BFF_AUTH_ENABLED:'true',BFF_WEB_ORIGIN:'https://web.test',BFF_IDENTITY_ORIGIN:'https://127.0.0.1:'+identity.address().port,BFF_NOTIFICATION_ORIGIN:'https://127.0.0.1:'+upstream.address().port});
  for(const prefix of ['BFF_IDENTITY','BFF_NOTIFICATION'])for(const [field,file]of Object.entries({KEY:'bff.key',CERT:'bff.crt',CA:'ca.crt'}))process.env[prefix+'_'+field+'_FILE']=join(tls.directory,file);
  const bff=createServer(tls.clients.server,(req,res)=>handleNotifications(req,res,'https://web.test'));await new Promise(r=>bff.listen(0,'127.0.0.1',r));cleanup.push(()=>new Promise(r=>bff.close(r)));
  function call(path='/api/v1/notifications',{method='GET',body,raw,headers={}}={}){return new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',servername:'localhost',port:bff.address().port,path,method,ca:tls.ca,agent:false,signal:AbortSignal.timeout(10000),headers:{host:'web.test',origin:'https://web.test','x-smartgym-csrf':'1','content-type':'application/json',cookie:'__Host-sg_session='+handle,...headers}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,body:text?JSON.parse(text):null,text,headers:res.headers}));});req.on('error',reject);req.end(raw??(body===undefined?undefined:JSON.stringify(body)));});}
  await t.test('only fresh server assertion goes upstream; strips spoofed headers/cookies and private response headers',async()=>{
    const response=await call('/api/v1/notifications?unreadOnly=false&limit=10',{headers:{authorization:'Bearer forged','x-user-id':randomUUID(),'x-user-role':'ADMIN'}});
    assert.equal(response.status,200);assert.equal(last.headers.authorization,'Bearer '+token);for(const key of ['cookie','x-user-id','x-user-role','origin','x-smartgym-csrf'])assert.equal(last.headers[key],undefined);assert.equal(response.headers['set-cookie'],undefined);assert.equal(response.text.includes(token),false);assert.equal(response.headers['cache-control'],'no-store');
  });
  await t.test('allowlist rejects internal routes, wrong methods, malformed UUID and missing/revoked session',async()=>{
    const before=calls;for(const [path,method]of [['/internal/v1/identity/jwks','GET'],['/api/v1/notifications','POST'],['/api/v1/notifications/bad/read','PUT']])assert.equal((await call(path,{method})).status,404);
    assert.equal((await call(undefined,{headers:{cookie:''}})).status,401);revoked=true;assert.equal((await call()).status,401);revoked=false;assert.equal(calls,before);
  });
  await t.test('booleans/integer query are checked; duplicate/unknown/out-of-range query never forwarded',async()=>{
    assert.equal((await call('/api/v1/notifications?unreadOnly=true&limit=100')).status,200);
    const before=calls;for(const suffix of ['?unreadOnly=yes','?limit=0','?limit=101','?unreadOnly=true&unreadOnly=false','?userId='+id,'?limit=01'])assert.equal((await call('/api/v1/notifications'+suffix)).status,400);assert.equal(calls,before);
  });
  await t.test('PUT preferences enforces CSRF, strong ETag, exact body and size budget',async()=>{
    const path='/api/v1/notification-preferences',options={method:'PUT',body:input,headers:{'if-match':'"v1"'}};
    assert.equal((await call(path,{...options,headers:{...options.headers,origin:'https://evil.test'}})).status,403);
    assert.equal((await call(path,{...options,headers:{...options.headers,'x-smartgym-csrf':''}})).status,403);
    assert.equal((await call(path,{method:'PUT',body:input})).status,428);
    assert.equal((await call(path,{...options,body:{...input,owner:id}})).status,422);assert.equal((await call(path,{...options,body:{...input,leadMinutes:4}})).status,422);
    assert.equal((await call(path,{...options,raw:JSON.stringify({...input,pad:'x'.repeat(70000)})})).status,400);
    const r=await call(path,options);assert.equal(r.status,200);assert.deepEqual(last.body,input);assert.equal(last.headers['if-match'],'"v1"');assert.equal(r.headers.etag,'"v1"');
  });
  await t.test('read PUT uses empty request and 204 body; malicious body is rejected',async()=>{
    const path='/api/v1/notifications/'+id+'/read';const response=await call(path,{method:'PUT'});assert.equal(response.status,204);assert.equal(response.body,null);
    assert.equal((await call(path,{method:'PUT',body:{userId:id}})).status,422);
  });
  await t.test('invalid schema, missing count, ETag mismatch, cache header, redirect and response overflow fail closed',async()=>{
    for(const value of ['extra','missing','cache','redirect','oversized']){mode=value;assert.equal((await call()).status,503,value);}
    mode='etag';assert.equal((await call('/api/v1/notification-preferences')).status,503);mode='extra';assert.equal((await call('/api/v1/notification-preferences')).status,503);mode='valid';
  });
  await t.test('known error code preserved without upstream SQL/provider details',async()=>{
    mode='error';const r=await call('/api/v1/notification-preferences',{method:'PUT',body:input,headers:{'if-match':'"v1"'}});assert.equal(r.status,412);assert.equal(r.body.code,'VERSION_MISMATCH');assert.equal(r.text.includes('secret'),false);assert.equal(r.text.includes('SQL'),false);mode='valid';
  });
});
