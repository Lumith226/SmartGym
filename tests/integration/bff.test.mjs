import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer,request} from 'node:https';import {randomUUID} from 'node:crypto';
import {createTestTls} from '../../backend/services/identity/test/tls.cjs';
import {handleAuth} from '../../frontend/server/auth.mjs';
test('BFF trust boundary, response filtering and secure cookie policy',{timeout:30000},async t=>{
  const tls=await createTestTls(),cleanup=[];cleanup.push(tls.stop);
  t.after(async()=>{for(const close of cleanup.reverse())await close();});
  let count=0,last,mode='valid';
  const profile={id:randomUUID(),email:'bff@example.test',displayName:'Người tập',emailVerified:true,roles:['USER'],timeZone:'Asia/Bangkok',createdAt:new Date().toISOString()};
  const handle='a'.repeat(43),cookie='__Host-sg_session='+handle+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800';
  const upstream=createServer({...tls.clients.server,ca:tls.ca,requestCert:true,rejectUnauthorized:true},async(req,res)=>{
    count++;let body='';for await(const chunk of req)body+=chunk;last={headers:req.headers,body};
    res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');
    if(mode==='redirect'){res.writeHead(307,{location:'https://evil.test'});res.end();return;}
    if(mode==='timeout'){setTimeout(()=>{if(!res.destroyed){res.writeHead(200);res.end(JSON.stringify(profile));}},6000).unref();return;}
    if(mode==='error'){res.writeHead(422);res.end(JSON.stringify({type:'about:blank',title:'secret-body',status:422,code:'UPSTREAM_PRIVATE',requestId:'server',detail:'never forward this'}));return;}
    if(mode==='cookie'){res.setHeader('set-cookie',cookie+'; Domain=evil.test');}
    else if(req.url.endsWith('/login'))res.setHeader('set-cookie',cookie);
    res.writeHead(200);res.end(JSON.stringify(mode==='private'?{...profile,accessToken:'secret-jwt'}:mode==='unverified'?{...profile,emailVerified:false}:profile));
  });
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));cleanup.push(()=>new Promise(resolve=>upstream.close(resolve)));
  const config={webOrigin:'https://web.test',identityOrigin:'https://127.0.0.1:'+upstream.address().port,tls:{...tls.clients.bff,ca:tls.ca}};
  const bff=createServer(tls.clients.server,(req,res)=>handleAuth(req,res,config));await new Promise(resolve=>bff.listen(0,'127.0.0.1',resolve));cleanup.push(()=>new Promise(resolve=>bff.close(resolve)));
  const call=(path='/api/v1/auth/login',options={})=>new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',servername:'localhost',port:bff.address().port,path,method:options.method??'POST',ca:tls.ca,agent:false,
      headers:{host:'web.test',origin:config.webOrigin,'x-smartgym-csrf':'1','content-type':'application/json',...options.headers}},res=>{
      let text='';res.setEncoding('utf8');res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:text?JSON.parse(text):null,text}));
    });req.on('error',reject);req.end(options.raw??JSON.stringify(options.body??{email:'bff@example.test',password:'password'}));
  });
  await t.test('allowlisted login returns only Profile and exact secure cookie',async()=>{
    const response=await call();assert.equal(response.status,200);assert.deepEqual(response.body,profile);assert.deepEqual(response.headers['set-cookie'],[cookie]);assert.equal(response.headers['cache-control'],'no-store');
  });
  await t.test('spoofed IP/role/auth headers and unrelated cookies never reach Identity',async()=>{
    await call('/api/v1/auth/login',{headers:{'x-smartgym-client-ip':'203.0.113.8','x-forwarded-for':'203.0.113.9','x-user-role':'ADMIN',authorization:'Bearer evil',cookie:'tracking=secret; __Host-sg_session='+handle}});
    assert.equal(last.headers['x-smartgym-client-ip'],'127.0.0.1');assert.equal(last.headers['x-forwarded-for'],undefined);assert.equal(last.headers['x-user-role'],undefined);assert.equal(last.headers.authorization,undefined);assert.equal(last.headers.cookie,'__Host-sg_session='+handle);
  });
  await t.test('Origin/CSRF/Host/site, JSON validation and request cap reject before upstream',async()=>{
    const before=count;
    for(const headers of [{origin:'https://evil.test'},{origin:''},{'x-smartgym-csrf':'0'},{host:'evil.test'},{'sec-fetch-site':'cross-site'},{'content-type':'text/plain'}])assert.ok([400,403].includes((await call('/api/v1/auth/login',{headers})).status));
    assert.equal((await call('/api/v1/auth/login',{raw:'{bad'})).status,400);
    assert.equal((await call('/api/v1/auth/login',{body:{email:'bff@example.test',password:'p',roles:['ADMIN']}})).status,422);
    assert.equal((await call('/api/v1/auth/login',{raw:'a'.repeat(17000)})).status,400);
    assert.equal((await call('/api/v1/auth/login',{headers:{cookie:'__Host-sg_session='+handle+'; __Host-sg_session='+handle}})).status,401);
    assert.equal(count,before);
  });
  await t.test('internal/non-allowlisted paths, wrong methods and query proxy attempts are blocked',async()=>{
    const before=count;assert.equal((await call('/internal/v1/identity/sessions/introspect')).status,404);assert.equal((await call('/api/v1/auth/unknown')).status,404);
    assert.equal((await call('/api/v1/auth/login',{method:'GET'})).status,404);assert.equal((await call('/api/v1/auth/login?target=https://evil.test')).status,400);assert.equal(count,before);
  });
  await t.test('private extra fields, unverified profile, foreign cookie and redirect fail closed',async()=>{
    for(mode of ['private','unverified','cookie','redirect']){const response=await call();assert.equal(response.status,503,mode);assert.equal(response.headers['set-cookie'],undefined);assert.equal(response.text.includes('secret-jwt'),false);assert.equal(response.headers.location,undefined);}mode='valid';
  });
  await t.test('upstream Problem details are removed and never cause automatic retries',async()=>{
    mode='error';const before=count,response=await call();assert.equal(response.status,422);assert.equal(response.body.code,'AUTH_REQUEST_FAILED');assert.equal(response.text.includes('secret-body'),false);assert.equal(response.text.includes('never forward'),false);assert.equal(count,before+1);mode='valid';
  });
  await t.test('absolute Identity deadline fails closed without retry or cookie',async()=>{
    mode='timeout';const before=count,start=Date.now(),response=await call();assert.equal(response.status,503);assert.equal(response.headers['set-cookie'],undefined);assert.equal(count,before+1);assert.ok(Date.now()-start<6500);mode='valid';
  });
  await t.test('return destinations reject external, encoded, protocol-relative and login loops',async()=>{
    const {safeReturnPath}=await import('../../frontend/app/auth/navigation.ts');
    for(const value of ['https://evil.test','//evil.test','/\\evil.test','/%2f%2fevil.test','/app/../admin','/dang-nhap','javascript:alert(1)',null,['/admin']])assert.equal(safeReturnPath(value),'/app');
    assert.equal(safeReturnPath('/app/ho-so'),'/app/ho-so');assert.equal(safeReturnPath('/admin'),'/admin');
  });
});
