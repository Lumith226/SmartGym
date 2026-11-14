// Explicit stored final-result fixtures. No ONNX inference or video access is claimed here.
import {randomUUID} from 'node:crypto';
import {createPoseApp} from '../../backend/services/pose/dist/app.js';
export async function startPoseSummary(db,tls,identityOrigin){
  let storageCalls=0;
  const unused=async()=>{storageCalls++;throw Error('Summary import must not access object/video storage');};
  const {app,stopLive}=await createPoseApp(db,{ready:async()=>{},grant:unused,head:unused,read:unused,remove:unused},
    {tls:{...tls.clients.server,ca:tls.ca},bffFingerprints:tls.callers.bff,progressFingerprints:tls.callers.catalog,
      identity:{...tls.clients.notification,ca:tls.ca,origin:identityOrigin,issuer:'https://identity.test'}},'pose-v1');
  await app.listen(0,'127.0.0.1');let stopped=false;
  return {origin:'https://127.0.0.1:'+app.getHttpServer().address().port,storageCalls:()=>storageCalls,stop:async()=>{if(stopped)return;stopped=true;stopLive();await app.close();}};
}
export async function seedPoseResult(db,owner,changes={},provenance={}){
  const result={id:randomUUID(),source:'LIVE',exerciseId:'bodyweight_squat',modelVersion:'stored-fixture-v1',configVersion:'fixture-v1',repCount:12,repCountStatus:'AVAILABLE',formStatus:'INSUFFICIENT_EVIDENCE',reps:[],limitations:['Stored summary fixture, not a new inference.'],completedAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),...changes};
  const sourceId=randomUUID(),modelSha=provenance.modelSha256??'b'.repeat(64),sourceSha=provenance.sourceSha256??'a'.repeat(64);let job=null,live=null;
  if(result.source==='VIDEO'){
    const upload=randomUUID();await db.query(`INSERT INTO pose_uploads(id,owner_id,object_key,sha256,size_bytes,mime,consent_version,put_expires_at,raw_expires_at)
      VALUES($1,$2,$3,$4,1,'video/mp4','pose-v1',$5,$5)`,[upload,owner,'fixture/'+upload,sourceSha,result.expiresAt]);
    await db.query(`INSERT INTO pose_jobs(id,owner_id,upload_id,exercise_id,model_sha256,config_version,consent_version,status,expires_at)
      VALUES($1,$2,$3,$4,$5,'fixture-v1','pose-v1','SUCCEEDED',$6)`,[sourceId,owner,upload,result.exerciseId,modelSha,result.expiresAt]);job=sourceId;
  }else{await db.query(`INSERT INTO pose_live_sessions(id,owner_id,exercise_id,model_sha256,config_version,consent_version,status,expires_at)
    VALUES($1,$2,$3,$4,'fixture-v1','pose-v1','COMPLETED',$5)`,[sourceId,owner,result.exerciseId,modelSha,result.expiresAt]);live=sourceId;}
  await db.query(`INSERT INTO pose_results(id,job_id,live_session_id,owner_id,summary,raw_model_result,source_sha256,model_sha256,schema_version,completed_at,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[result.id,job,live,owner,JSON.stringify(result),provenance.rawModelResult?JSON.stringify(provenance.rawModelResult):job?JSON.stringify({fixture:'private raw must never reach Progress'}):null,sourceSha,modelSha,provenance.schemaVersion??'fixture-v1',result.completedAt,result.expiresAt]);
  return result;
}
