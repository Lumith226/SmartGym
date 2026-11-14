// Explicit protocol fixture, not a corpus, index, LLM or generation acceptance.
import {createServer} from 'node:https';import {writeFile,readFile} from 'node:fs/promises';import {join} from 'node:path';
export async function startChatProvider(tls){
  const token='fixture-only-rag-provider-token-123456789',revision='c'.repeat(16);let mode='valid',delay=0,last,calls=0;
  const server=createServer({...tls.clients.server,ca:tls.ca,requestCert:true,rejectUnauthorized:true},async(req,res)=>{
    if(req.socket.getPeerCertificate().fingerprint256!==tls.callers.bff[0]||req.headers.authorization!=='Bearer '+token){res.writeHead(403);res.end();return;}
    res.setHeader('content-type','application/json');
    if(req.url==='/health'){res.end(JSON.stringify({kb_ready:mode!=='not-ready',runtime_revision:revision}));return;}
    if(req.url!=='/v1/chatbot'){res.writeHead(404);res.end('{}');return;}
    let text='';for await(const c of req)text+=c;last=JSON.parse(text);calls++;if(delay)await new Promise(r=>setTimeout(r,delay));if(res.destroyed)return;
    const status=mode==='unavailable'?'unavailable':mode==='insufficient'?'insufficient_evidence':'grounded_guidance';
    const records=[...new Map(last.records.map(r=>[r.source_id+':'+r.model_result.exercise+':'+r.model_result.scope,r])).values()];
    res.end(JSON.stringify({reply:mode==='unavailable'?'Bộ trả lời chưa khả dụng.':mode==='markup'?'<script>alert("fixture")</script>':'Câu trả lời fixture: hãy đối chiếu kỹ thuật với nguồn hướng dẫn.',task:last.task,status,generation_used:false,generation_mode:'none',kb_version:'fixture-kb.v1',model_version:'none',
      citations:status==='unavailable'?[]:['book:fixture:1'],references:status==='unavailable'?[]:[{number:1,chunk_id:'book:fixture:1'}],
      evidence:status==='unavailable'?[]:[{chunk_id:'book:fixture:1',source_id:'approved-fixture-book',title:'Sổ tay kỹ thuật thử nghiệm',publisher:'Nguồn fixture',url:'https://example.org/fixture-book',pdf_page:15,section:'Quan sát kỹ thuật',text:'Bằng chứng fixture để kiểm giao diện, không phải corpus thật.'}],
      session:{units:records.map(r=>({observation_id:r.observation_id,source_id:r.source_id,exercise_code:'SQUAT',scope:r.model_result.scope,usable:true,simulated:false,error_labels:[]})),errors:[],penalty_total:null,scoring_policy:null},
      user_notices:records.length<last.records.length?['Đã bỏ qua bản ghi trùng nguồn/phạm vi.']:[],technical_details:{warnings:['Do not expose /run/secrets/fixture']}}));
  });server.on('tlsClientError',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const tokenFile=join(tls.directory,'rag.token'),sourcesFile=join(tls.directory,'rag-sources.json');await writeFile(tokenFile,token);await writeFile(sourcesFile,JSON.stringify([{id:'approved-fixture-book',rightsStatus:'APPROVED',kind:'BOOK',allowedOrigins:['https://example.org']}]));
  return {env:{BFF_RAG_ENABLED:'true',BFF_RAG_ORIGIN:'https://127.0.0.1:'+server.address().port,BFF_RAG_RUNTIME_REVISION:revision,BFF_RAG_TOKEN_FILE:tokenFile,BFF_RAG_SOURCES_FILE:sourcesFile,BFF_RAG_TLS_KEY_FILE:join(tls.directory,'bff.key'),BFF_RAG_TLS_CERT_FILE:join(tls.directory,'bff.crt'),BFF_RAG_TLS_CA_FILE:join(tls.directory,'ca.crt')},
    mode:(value,ms=0)=>{mode=value;delay=ms;},last:()=>last,calls:()=>calls,stop:()=>new Promise(r=>server.close(r))};
}
export async function seedChatPose(db,owner){
  const {seedPoseResult}=await import('./pose-summary.mjs');
  const m=JSON.parse(await readFile('docs/api/ai-provider-compatibility.yaml','utf8')).models[0];
  const spec=JSON.parse(await readFile('backend/services/pose/data/models.json','utf8')).find(row=>row.catalogId===m.catalog_id);
  const raw={exercise:m.pose_id,schema_version:m.schema_version,scope:'video',quality:{usable:true},source:{video_sha256:'a'.repeat(64)},model_provenance:{model_sha256:m.model_sha256},
    label_results:spec.labels.map(l=>({key:l.key,kind:l.kind,raw_label:l.raw_label,probability:l.calibrated?.1:null,threshold:l.threshold}))};
  return seedPoseResult(db,owner,{source:'VIDEO',repCount:null,repCountStatus:'UNAVAILABLE',formStatus:'ASSESSED'},{rawModelResult:raw,modelSha256:m.model_sha256,schemaVersion:m.schema_version});
}
