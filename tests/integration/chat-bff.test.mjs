import {test} from 'node:test';import assert from 'node:assert/strict';
import {createServer,request} from 'node:https';import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
import {createTestTls} from '../../backend/apps/identity/test/tls.cjs';
import {createChatHandler,loadChatConfig} from '../../frontend/server/chat.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('T27 BFF over mTLS provider/Pose fixtures; no real corpus or generation claimed',{timeout:60000},async t=>{
  const tls=await createTestTls(),cleanup=[tls.stop];t.after(async()=>{for(const close of cleanup.reverse())await close();});
  const token='provider-test-token-not-a-real-secret-123456',assertionToken='owner-assertion-fixture',owner=randomUUID(),id=randomUUID(),revision='a'.repeat(16);
  let mode='valid',last,calls=0,healthCalls=0,rawCalls=0,inventoryCalls=0,revoked=false,now=Date.now(),delay=0;
  const model=JSON.parse(await readFile('docs/api/ai-provider-compatibility.yaml','utf8')).models[0];
  const raw={result:{id,source:'VIDEO',exerciseId:model.catalog_id,modelVersion:'ST-GCNpp-V4',configVersion:'v4',repCount:null,repCountStatus:'UNAVAILABLE',reps:[],formStatus:'ASSESSED',limitations:[],completedAt:new Date().toISOString(),expiresAt:"2100-01-01T00:00:00Z"},sourceId:'sha256:'+'b'.repeat(64),modelSha256:model.model_sha256,
    rawModelResult:{exercise:model.pose_id,schema_version:model.schema_version,scope:'video',quality:{usable:true},label_results:Array.from({length:14},(_,i)=>({key:'fixture_'+i,kind:'error',raw_label:'fixture',probability:.2,threshold:.5})),model_provenance:{model_sha256:model.model_sha256},source:{video_sha256:'b'.repeat(64)}}};
  const evidence={chunk_id:'book:chunk1',source_id:'approved-book',title:'Nguồn hướng dẫn đã duyệt',publisher:'Nhà xuất bản',url:'https://example.org/book',pdf_page:12,section:'Kỹ thuật',text:'Nội dung bằng chứng.',score:1,channels:['fixture']};
  function output(task){return {reply:'Trả lời thử nghiệm có nguồn.',task,status:'grounded_guidance',generation_used:false,generation_mode:'none',kb_version:'book-kb.v1',model_version:'none',citations:['book:chunk1'],references:[{number:1,chunk_id:'book:chunk1'}],evidence:[evidence],user_notices:['Chưa có thang điểm được phê duyệt.'],session:{observations:[]},technical_details:{token:'must-not-leak',warnings:['SQL /run/secrets/password']}};}
  const privateTls={...tls.clients.server,ca:tls.ca,requestCert:true,rejectUnauthorized:true};
  async function serve(handler){const s=createServer(privateTls,handler);s.on('tlsClientError',()=>{});await new Promise(r=>s.listen(0,'127.0.0.1',r));cleanup.push(()=>new Promise(r=>s.close(r)));return 'https://127.0.0.1:'+s.address().port;}
  const origin=await serve(async(req,res)=>{assert.equal(req.socket.getPeerCertificate().fingerprint256,tls.callers.bff[0]);assert.equal(req.headers.authorization,'Bearer '+token);
    res.setHeader('content-type','application/json');if(req.url==='/health'){healthCalls++;res.end(JSON.stringify({kb_ready:mode!=='not-ready',kb_version:'book-kb.v1',runtime_revision:mode==='revision'?'f'.repeat(16):revision}));return;}
    if(req.url==='/v1/kb/sources'){
      assert.equal(req.method,'GET');
      inventoryCalls++;
      res.end(JSON.stringify([
        {id:'approved-book',title:'Sách đã lập chỉ mục',publisher:'Nhà xuất bản',chunks:4,file:'/private/book.pdf'},
        {id:'unapproved-book',title:'Sách chưa duyệt',publisher:'Nhà xuất bản',chunks:4},
        {id:'missing-book',title:'Sách chưa lập chỉ mục',publisher:'Nhà xuất bản',chunks:0},
      ]));
      return;
    }
    if(req.url==='/internal/v1/ollama/runtime'){
      res.end(JSON.stringify({state:mode==='unknown-runtime'?'unknown':req.method==='POST'?'gpu':'idle',private:'hide me'}));return;
    }
    assert.ok(['/v1/chatbot','/internal/v1/chatbot/qwen','/internal/v1/chatbot/gemini'].includes(req.url));calls++;let text='';for await(const c of req)text+=c;last={path:req.url,headers:req.headers,body:JSON.parse(text)};
    if(delay)await pause(delay);if(res.destroyed)return;let out=output(last.body.task);
    if(mode==='unavailable'){out.status='unavailable';out.reply='Chưa kết nối được model.';out.user_notices=[];}
    if(mode.startsWith('status:')){out.status=mode.slice(7);out.generation_used=out.status==='generated';}
    if(mode==='status')out.status='ANSWERED';if(mode==='missing')delete out.reply;if(mode==='mapping')out.references[0].chunk_id='missing';
    if(mode==='catalog')out.evidence=[{...evidence,source_id:'ex_forged'}];if(mode==='url')out.evidence=[{...evidence,url:'javascript:alert(1)'}];
    if(mode==='notice')out.user_notices=['Bearer hidden-token','Thông báo bình thường'];if(mode==='penalty')out.session.penalty_total=7;
    if(mode==='too-large'){res.end(JSON.stringify({...out,pad:'x'.repeat(2200000)}));return;}
    if(mode==='error'){res.statusCode=422;out={detail:'/run/secrets/provider token=secret'};}if(mode==='redirect'){res.statusCode=302;res.setHeader('Location','https://evil.test');}
    res.end(JSON.stringify(out));
  });
  const poseOrigin=await serve(async(req,res)=>{assert.equal(req.headers.authorization,'Bearer '+assertionToken);assert.equal(req.url,'/internal/v1/pose/results/'+id+'/raw');rawCalls++;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');let body=structuredClone(raw);
    if(mode==='other-owner'){res.statusCode=404;body={};}if(mode==='expired')body.result.expiresAt='2000-01-01T00:00:00Z';if(mode==='digest')body.modelSha256='f'.repeat(64);if(mode==='raw-id')body.result.id=randomUUID();res.end(JSON.stringify(body));});
  const config={origin,tls:{...tls.clients.bff,ca:tls.ca},token,revision,sources:new Map([
    ['approved-book',{origins:new Set(['https://example.org'])}],
    ['missing-book',{origins:new Set(['https://example.org'])}],
  ])};
  const principal=async cookie=>{if(cookie!=='__Host-sg_session='+'s'.repeat(43)||revoked)throw Object.assign(new (await import('../../frontend/server/identity-client.mjs')).AuthError(401,'UNAUTHENTICATED'));return {userId:owner,accessToken:assertionToken};};
  let handler=createChatHandler({configuration:async()=>config,assertion:principal,poseConfiguration:async()=>({origin:poseOrigin,tls:config.tls}),clock:()=>now});
  const web=createServer(tls.clients.server,(req,res)=>handler(req,res,'https://127.0.0.1:'+web.address().port));await new Promise(r=>web.listen(0,'127.0.0.1',r));cleanup.push(()=>new Promise(r=>web.close(r)));const webOrigin='https://127.0.0.1:'+web.address().port;
  const fresh=()=>{now+=61000;mode='valid';delay=0;revoked=false;};
  const call=({body={message:'Cách tập squat?',task:'knowledge'},headers={},path='/api/v1/chat',method='POST',rawBody}={})=>new Promise((resolve,reject)=>{
    const payload=rawBody??JSON.stringify(body);const q=request(webOrigin+path,{method,ca:tls.ca,headers:{origin:webOrigin,'x-smartgym-csrf':'1','content-type':'application/json',...headers}},res=>{let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text,body:JSON.parse(text)}));});q.on('error',reject);q.end(payload);
  });
  await t.test('knowledge anonymous; projection keeps KB version/references and strips technical trace and browser headers',async()=>{fresh();const r=await call({headers:{authorization:'Bearer forged','x-user-id':'forged','x-forwarded-for':'evil'}});assert.equal(r.status,200,r.text);assert.equal(r.body.kb_version,'book-kb.v1');assert.equal(r.body.references[0].namespace,'kb');assert.equal(r.body.references[0].pdf_page,12);assert.equal(r.headers['cache-control'],'no-store');assert.ok(!r.text.includes('must-not-leak'));assert.ok(!r.text.includes(token));assert.equal(last.headers.cookie,undefined);assert.equal(last.headers['x-user-id'],undefined);assert.equal(last.body.generate,true);assert.deepEqual(last.body.rules,[]);assert.equal(last.body.scoring_policy,null);});
  await t.test('lists only indexed and approved sources without generation, preserving citation follow-ups',async()=>{
    fresh();
    const before = calls;
    const inventoryBefore = inventoryCalls;
    const conversation = [{role:'user',content:'chao'},{role:'assistant',content:'Chào bạn!'}];
    const r = await call({body:{message:'bạn có những nguồn dữ liệu nào',task:'knowledge',conversation}});
    assert.equal(r.status,200,r.text);
    assert.equal(r.body.generation_mode,'source_inventory');
    assert.equal(r.body.generation_used,false);
    assert.equal(r.body.kb_version,'book-kb.v1');
    assert.deepEqual(r.body.references,[]);
    assert.match(r.body.reply,/Sách đã lập chỉ mục/);
    assert.doesNotMatch(r.text,/Sách chưa duyệt|Sách chưa lập chỉ mục|private\/book/);
    assert.equal(calls,before);
    assert.equal(inventoryCalls,inventoryBefore+1);
    const followUp = await call({body:{message:'Nguồn của câu trả lời trước là gì?',task:'knowledge',conversation}});
    assert.equal(followUp.status,200,followUp.text);
    assert.equal(calls,before+1);
    assert.equal(inventoryCalls,inventoryBefore+1);
  });
  await t.test('Ollama placement is private upstream and active check requires same origin',async()=>{
    fresh();const path='/api/v1/chat/ollama-runtime';
    const read=await call({path,method:'GET',rawBody:''});
    assert.equal(read.headers['cache-control'],'no-store');
    assert.deepEqual(read.body,{state:'idle'});
    assert.equal((await call({path,headers:{origin:'https://evil.test'}})).status,403);
    assert.deepEqual((await call({path,rawBody:''})).body,{state:'gpu'});
    mode='unknown-runtime';
    assert.equal((await call({path,method:'GET',rawBody:''})).status,503);
  });
  for (const provider of ['qwen', 'gemini']) {
    await t.test(provider + ' is opt-in and cannot send session records or conversation history', async () => {
      const code = provider.toUpperCase();
      const flag = 'SMARTGYM_' + code + '_ENABLED';
      const saved = process.env[flag];
      const body = {message:'Cách tập squat?',task:'knowledge',provider};
      try {
        fresh();
        process.env[flag] = 'false';
        assert.equal((await call({body})).body.code,code + '_DISABLED');
        process.env[flag] = 'true';
        const before = calls;
        for (const forbidden of [{poseResultIds:[id]},{task:'summary'},{conversation:[{role:'user',content:'Private context'}]}]) {
          assert.equal((await call({body:{...body,...forbidden}})).body.code,code + '_KNOWLEDGE_ONLY');
        }
        assert.equal(calls,before);
        assert.equal((await call({body})).status,200);
        assert.equal(last.path,'/internal/v1/chatbot/' + provider);
        assert.deepEqual(last.body.records,[]);
        assert.deepEqual(last.body.conversation,[]);
        fresh();
        assert.equal((await call()).status,200);
        assert.equal(last.path,'/v1/chatbot');
      } finally {
        if (saved === undefined) delete process.env[flag];
        else process.env[flag] = saved;
      }
    });
  }
  await t.test('route, CSRF, query, body and forged records/policy denied before provider',async()=>{fresh();const before=calls;assert.equal((await call({method:'GET',rawBody:''})).status,200);for(const opt of [{method:'PUT'},{path:'/api/v1/chat/sources/x'},{path:'/internal'},{headers:{origin:'https://evil.test'}},{headers:{'x-smartgym-csrf':''}},{path:'/api/v1/chat?owner=x'},{body:{message:'ok',task:'knowledge',records:[]}},{body:{message:'ok',task:'score',rules:[]}},{body:{message:' ',task:'knowledge'}},{rawBody:'x'.repeat(140000)}])assert.ok((await call(opt)).status>=400,JSON.stringify(opt).slice(0,200));assert.equal(calls,before);});
  await t.test('all personal tasks require session; owner raw/manifest only, no automatic score; selected state is not observation',async()=>{for(const task of ['score','summary','practice']){fresh();assert.equal((await call({body:{message:'Nhận xét buổi tập',task}})).status,401);const r=await call({body:{message:'Nhận xét buổi tập',task,poseResultIds:[id]},headers:{cookie:'__Host-sg_session='+'s'.repeat(43)}});assert.equal(r.status,200,r.text);assert.equal(r.body.session.penalty_total,null);assert.equal(last.body.records[0].observation_id,id);assert.equal(last.body.records[0].source_id,raw.sourceId);assert.equal(last.body.records[0].simulated,false);assert.deepEqual(last.body.records[0].model_result,raw.rawModelResult);assert.equal(last.body.video_context.state,'analyzed');}
    fresh();assert.equal((await call({body:{message:'Nhận xét video này',task:'knowledge',videoState:'selected'}})).status,200);assert.equal(last.body.records.length,0);assert.equal(last.body.video_context.state,'selected');});
  await t.test('unknown owner, expired result, manifest digest mismatch, ID mismatch and duplicate IDs never reach chat',async()=>{for(const kind of ['other-owner','expired','digest','raw-id']){fresh();mode=kind;const before=calls;const r=await call({body:{message:'Nhận xét',task:'summary',poseResultIds:[id]},headers:{cookie:'__Host-sg_session='+'s'.repeat(43)}});assert.equal(r.status,kind==='other-owner'?404:kind==='expired'?410:503,r.text);assert.equal(calls,before);}fresh();assert.equal((await call({body:{message:'Nhận xét',task:'summary',poseResultIds:[id,id]},headers:{cookie:'__Host-sg_session='+'s'.repeat(43)}})).status,422);});
  await t.test('not-ready and runtime mismatch block POST; provider errors/redirect/overflow/schema/mapping/catalog/policy fail closed',async()=>{for(const kind of ['not-ready','revision','error','redirect','too-large','status','missing','mapping','catalog','penalty']){fresh();mode=kind;const r=await call();assert.equal(r.status,503,kind+': '+r.text);assert.ok(!r.text.includes('secret'));}});
  await t.test('HTTP200 unavailable and other statuses preserved; untrusted URL disabled and private notices removed',async()=>{for(const kind of ['unavailable','url','notice']){fresh();mode=kind;const r=await call();assert.equal(r.status,200,r.text);if(kind==='unavailable')assert.equal(r.body.status,'unavailable');if(kind==='url')assert.equal(r.body.references[0].url,null);if(kind==='notice')assert.deepEqual(r.body.user_notices,['Thông báo bình thường']);}});
  await t.test('all nine provider status branches and eight conversation turns preserve their meaning',async()=>{
    for(const status of ['generated','grounded_guidance','evidence_only','insufficient_evidence','insufficient_observation','conversational','needs_clarification','out_of_scope','unavailable']){fresh();mode='status:'+status;const conversation=Array.from({length:8},(_,i)=>({role:i%2?'assistant':'user',content:'Lượt '+i}));const r=await call({body:{message:'Hỏi tiếp chủ đề mới',task:'knowledge',conversation}});assert.equal(r.status,200,r.text);assert.equal(r.body.status,status);assert.deepEqual(last.body.conversation,conversation);}fresh();assert.equal((await call({headers:{cookie:'analytics=unrelated'}})).status,200);
  });
  await t.test('per-key rate limit ignores forged forwarding headers, isolates concurrent request, and recovers after window',async()=>{fresh();for(let i=0;i<5;i++)assert.equal((await call({headers:{'x-forwarded-for':String(i)}})).status,200);assert.equal((await call({headers:{'x-forwarded-for':'new'}})).status,429);fresh();delay=150;const first=call();await pause(40);assert.equal((await call()).status,429);assert.equal((await first).status,200);fresh();assert.equal((await call()).status,200);fresh();delay=150;const count=calls,a=call(),b=call({headers:{cookie:'__Host-sg_session='+'s'.repeat(43)}});for(let i=0;i<100&&calls<count+2;i++)await pause(5);assert.equal(calls,count+2);assert.equal((await call({body:{message:'Nhận xét',task:'summary'},headers:{cookie:'invalid'}})).status,429);assert.equal((await a).status,200);assert.equal((await b).status,200);});
  await t.test('logout during generation denies response and timeout performs no POST retry; next request can recover',async()=>{fresh();delay=150;const pending=call({headers:{cookie:'__Host-sg_session='+'s'.repeat(43)}});await pause(60);revoked=true;assert.equal((await pending).status,401);fresh();handler=createChatHandler({configuration:async()=>config,assertion:principal,deadlineMs:60});delay=150;const before=calls;assert.equal((await call()).status,504);assert.equal(calls,before+1);await pause(180);fresh();assert.equal((await call()).status,200);});
  await t.test('source rights removed during generation are rechecked before exposing citations',async()=>{fresh();delay=150;handler=createChatHandler({configuration:async()=>({...config,sources:new Map(config.sources)}),assertion:principal});const before=calls,pending=call(),source=config.sources.get('approved-book');try{for(let i=0;i<100&&calls===before;i++)await pause(5);assert.equal(calls,before+1);config.sources.delete('approved-book');const r=await pending;assert.equal(r.status,503);assert.equal(r.body.code,'RAG_SOURCE_NOT_APPROVED');}finally{config.sources.set('approved-book',source);}});
  await t.test('deadline also bounds slow identity/config preparation before POST',async()=>{fresh();handler=createChatHandler({configuration:async()=>{await pause(150);return config;},assertion:principal,deadlineMs:40});const before=calls;assert.equal((await call()).status,504);assert.equal(calls,before);handler=createChatHandler({configuration:async()=>config,assertion:async()=>{await pause(150);return principal('__Host-sg_session='+'s'.repeat(43));},deadlineMs:40});assert.equal((await call({body:{message:'Nhận xét',task:'summary'}})).status,504);assert.equal(calls,before);});
  await t.test('runtime configuration requires opt-in TLS/token/pin and approved source registry',async()=>{const prefix=join(tls.directory,'chat');await writeFile(prefix+'.token',token);await writeFile(prefix+'.sources',JSON.stringify([{id:'approved-book',kind:'BOOK',rightsStatus:'APPROVED',allowedOrigins:['https://example.org']}]));Object.assign(process.env,{BFF_RAG_ENABLED:'true',BFF_RAG_ORIGIN:origin,BFF_RAG_RUNTIME_REVISION:revision,BFF_RAG_TLS_KEY_FILE:join(tls.directory,'bff.key'),BFF_RAG_TLS_CERT_FILE:join(tls.directory,'bff.crt'),BFF_RAG_TLS_CA_FILE:join(tls.directory,'ca.crt'),BFF_RAG_TOKEN_FILE:prefix+'.token',BFF_RAG_SOURCES_FILE:prefix+'.sources'});assert.equal((await loadChatConfig()).sources.size,1);process.env.BFF_RAG_ORIGIN='http://127.0.0.1';await assert.rejects(loadChatConfig);process.env.BFF_RAG_ORIGIN=origin;await writeFile(prefix+'.sources',JSON.stringify([{id:'ex_catalog',kind:'BOOK',rightsStatus:'APPROVED',allowedOrigins:[]}]));await assert.rejects(loadChatConfig);process.env.BFF_RAG_ENABLED='false';await assert.rejects(loadChatConfig);});
  assert.ok(healthCalls>calls);assert.ok(rawCalls>=4);
});
