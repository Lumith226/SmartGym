import { createHash,randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import type { Database,SqlClient } from '../../database.js';
import type { CatalogClient } from './catalog-client.js';
import type { WorkoutClient,Occurrence } from './workout-client.js';
import { reject,uuid,valid } from '../../contract.js';
import {unavailablePose,type PoseClient,type ImportedPoseSummary} from './pose-client.js';
export type LoggedSet={exerciseId:string;ordinal:number;repetitions?:number;durationSeconds?:number;weightKg?:number;rpe?:number};
export type LogInput={occurrenceId?:string;performedAt:string;durationSeconds?:number;notes?:string;sets:LoggedSet[]};
type ViewSet=LoggedSet&{exerciseNameVi:string};
export type Log=Omit<LogInput,'sets'>&{id:string;sets:ViewSet[];source:'MANUAL'|'OCCURRENCE'|'POSE';poseResultId?:string;poseSummary?:ImportedPoseSummary;version:number;createdAt:string;updatedAt:string};
export type PoseImport={poseResultId:string;occurrenceId?:string;performedAt?:string};
type Row=Record<string,unknown>&{id:string;owner_user_id:string;occurrence_id:string|null;pose_result_id:string|null;performed_at:Date;duration_seconds:number|null;notes:string|null;source_type:Log['source'];source_snapshot:Partial<Occurrence>&{poseSummary?:ImportedPoseSummary};deleted_at:Date|null;version:number;created_at:Date;updated_at:Date;sets:ViewSet[]};
function canonical(value:unknown):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';return JSON.stringify(value);}
const fingerprint=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const select=`SELECT l.*,coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('exerciseId',e.exercise_id,
 'exerciseNameVi',e.title_snapshot,'ordinal',s.ordinal,'repetitions',s.repetitions,'durationSeconds',s.duration_seconds,
 'weightKg',s.weight_kg,'rpe',s.rpe)) ORDER BY e.order_no,s.ordinal) FROM log_exercises e JOIN log_sets s ON s.log_exercise_id=e.id WHERE e.log_id=l.id),'[]'::jsonb) AS sets FROM workout_logs l`;
const document=(r:Row):Log=>({id:r.id,...(r.occurrence_id?{occurrenceId:r.occurrence_id}:{}),...(r.pose_result_id?{poseResultId:r.pose_result_id}:{}),performedAt:r.performed_at.toISOString(),
 ...(r.duration_seconds===null?{}:{durationSeconds:r.duration_seconds}),...(r.notes===null?{}:{notes:r.notes}),...(r.source_snapshot.poseSummary?{poseSummary:r.source_snapshot.poseSummary}:{}),sets:r.sets,source:r.source_type,version:r.version,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString()});
function timestamp(value:unknown,code='VALIDATION_ERROR'){
  try{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value))throw Error();
    const instant=Temporal.Instant.from(value),year=instant.toZonedDateTimeISO('UTC').year;if(year<1||year>9999)throw Error();return new Date(instant.epochMilliseconds).toISOString();
  }catch{reject(code==='BAD_REQUEST'?400:422,code);}
}
export function validateInput(value:unknown):LogInput{
  if(!valid('WorkoutLogInput',value))reject(422,'VALIDATION_ERROR');
  const body=value as LogInput;
  if(body.notes?.includes('\u0000'))reject(422,'VALIDATION_ERROR');
  const keys=body.sets.map(s=>s.exerciseId+':'+s.ordinal);if(new Set(keys).size!==keys.length)reject(422,'DUPLICATE_SET');
  return {...body,...(body.occurrenceId?{occurrenceId:body.occurrenceId.toLowerCase()}:{}),performedAt:timestamp(body.performedAt)};
}
export function validatePoseImport(value:unknown):PoseImport{
  if(!valid('PoseResultImport',value))reject(422,'VALIDATION_ERROR');const input=value as PoseImport;
  return {poseResultId:input.poseResultId.toLowerCase(),...(input.occurrenceId?{occurrenceId:input.occurrenceId.toLowerCase()}:{}),...(input.performedAt?{performedAt:timestamp(input.performedAt)}:{})};
}
async function owned(db:SqlClient,owner:string,id:string,lock=false,deleted=false){const row=(await db.query<Row>(select+' WHERE l.owner_user_id=$1 AND l.id=$2'+(deleted?'':' AND l.deleted_at IS NULL')+(lock?' FOR UPDATE OF l':''),[owner,id])).rows[0];if(!row)reject(404,'NOT_FOUND');return row;}
const lockOwner=(db:SqlClient,owner:string)=>db.query('SELECT pg_advisory_xact_lock(73031,hashtext($1))',[owner]);
async function saveSets(db:SqlClient,id:string,sets:LoggedSet[],names:Map<string,string>){
  const ids=[...new Set(sets.map(s=>s.exerciseId))];
  for(const [order,exerciseId]of ids.entries()){
    const exercise=randomUUID();await db.query('INSERT INTO log_exercises(id,log_id,exercise_id,title_snapshot,order_no) VALUES($1,$2,$3,$4,$5)',[exercise,id,exerciseId,names.get(exerciseId),order]);
    for(const s of sets.filter(s=>s.exerciseId===exerciseId))await db.query(`INSERT INTO log_sets(id,log_exercise_id,ordinal,repetitions,duration_seconds,weight_kg,rpe) VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),exercise,s.ordinal,s.repetitions??null,s.durationSeconds??null,s.weightKg??null,s.rpe??null]);
  }
}
export class Logs{
  constructor(private readonly db:Database,private readonly catalog:CatalogClient,private readonly workout:WorkoutClient,private readonly now=()=>new Date(),private readonly pose:PoseClient=unavailablePose){}
  async get(owner:string,id:string){return document(await owned(this.db,owner,id));}
  private future(input:LogInput){if(Date.parse(input.performedAt)>this.now().getTime())reject(422,'PERFORMED_AT_IN_FUTURE');}
  private async replay(db:SqlClient,owner:string,key:string,digest:string,operation='log:create'){
    const r=(await db.query<{fingerprint:string;response:Log|null;deleted_at:Date|null}>(`SELECT i.fingerprint,i.response,l.deleted_at FROM progress_idempotency i JOIN workout_logs l ON l.id=i.log_id
      WHERE i.owner_user_id=$1 AND i.operation=$3 AND i.key=$2 AND i.expires_at>now()`,[owner,key,operation])).rows[0];
    if(!r)return;if(r.fingerprint!==digest)reject(409,'IDEMPOTENCY_CONFLICT');if(r.deleted_at||!r.response)reject(410,'LOG_DELETED');return r.response;
  }
  private async poseFree(db:SqlClient,owner:string,id:string){
    const old=(await db.query<{id:string;deleted_at:Date|null}>('SELECT id,deleted_at FROM workout_logs WHERE owner_user_id=$1 AND pose_result_id=$2',[owner,id])).rows[0];
    if(old)throw new HttpException({code:'POSE_RESULT_ALREADY_IMPORTED',detail:old.deleted_at?'Nhật ký nguồn đã bị xóa, kết quả vẫn giữ dấu chống trùng.':'Nhật ký đã có: /api/v1/progress/logs/'+old.id},409);
  }
  async importPose(owner:string,key:string,input:PoseImport,bearer:string){
    const digest=fingerprint(input),operation='pose:import',prior=await this.replay(this.db,owner,key,digest,operation);if(prior)return prior;
    await this.poseFree(this.db,owner,input.poseResultId);await this.occurrenceFree(this.db,owner,input.occurrenceId);
    const result=await this.pose(input.poseResultId,bearer);
    if(!valid('PoseResult',result)||result.id.toLowerCase()!==input.poseResultId)reject(503,'POSE_UNAVAILABLE');
    let completed:string,expiresAt:string;try{completed=timestamp(result.completedAt);expiresAt=timestamp(result.expiresAt);}catch{reject(503,'POSE_UNAVAILABLE');}
    const expiry=Date.parse(expiresAt);if(expiry<=this.now().getTime())reject(410,'RESULT_EXPIRED');
    if(Date.parse(completed)>this.now().getTime()||expiry<=Date.parse(completed))reject(503,'POSE_UNAVAILABLE');
    if(result.repCountStatus!=='AVAILABLE'||result.repCount===null||result.repCount<1)reject(422,'NO_LOGGABLE_RESULT');
    const summary:ImportedPoseSummary={id:result.id.toLowerCase(),source:result.source,exerciseId:result.exerciseId,modelVersion:result.modelVersion,configVersion:result.configVersion,
      repCount:result.repCount,repCountStatus:'AVAILABLE',formStatus:result.formStatus,completedAt:completed,expiresAt};
    const sets:LoggedSet[]=[{exerciseId:result.exerciseId,ordinal:1,repetitions:result.repCount}],performedAt=input.performedAt??completed;
    this.future({performedAt,sets});const occurrence=input.occurrenceId?await this.workout(input.occurrenceId,bearer):{};
    const names=await this.names(sets);
    return this.db.transaction(async db=>{
      await lockOwner(db,owner);const prior=await this.replay(db,owner,key,digest,operation);if(prior)return prior;
      await this.poseFree(db,owner,input.poseResultId);await this.occurrenceFree(db,owner,input.occurrenceId);
      if(expiry<=this.now().getTime())reject(410,'RESULT_EXPIRED');
      const id=randomUUID();await db.query(`INSERT INTO workout_logs(id,owner_user_id,occurrence_id,pose_result_id,performed_at,source_type,source_snapshot)
        VALUES($1,$2,$3,$4,$5,'POSE',$6)`,[id,owner,input.occurrenceId??null,input.poseResultId,performedAt,JSON.stringify({...occurrence,poseSummary:summary})]);
      await saveSets(db,id,sets,names);const log=document(await owned(db,owner,id));
      await db.query("DELETE FROM progress_idempotency WHERE owner_user_id=$1 AND operation='pose:import' AND key=$2 AND expires_at<=now()",[owner,key]);
      await db.query('INSERT INTO progress_idempotency(owner_user_id,operation,key,fingerprint,log_id,response) VALUES($1,$2,$3,$4,$5,$6)',[owner,operation,key,digest,id,JSON.stringify(log)]);return log;
    });
  }
  private async occurrenceFree(db:SqlClient,owner:string,id?:string){if(!id)return;const old=(await db.query<{id:string;deleted_at:Date|null}>('SELECT id,deleted_at FROM workout_logs WHERE owner_user_id=$1 AND occurrence_id=$2',[owner,id])).rows[0];
    if(old)throw new HttpException({code:'OCCURRENCE_ALREADY_LOGGED',detail:old.deleted_at?'Nhật ký liên kết đã bị xóa, buổi vẫn giữ dấu chống trùng.':'Nhật ký đã có: /api/v1/progress/logs/'+old.id},409);
  }
  private async names(sets:LoggedSet[],old:ViewSet[]=[],snapshot:Partial<Occurrence>={}){
    const names=new Map<string,string>(snapshot.plannedExercises?.map(s=>[s.exerciseId,s.exerciseNameVi])??[]);
    for(const s of old)names.set(s.exerciseId,s.exerciseNameVi);
    const missing=[...new Set(sets.map(s=>s.exerciseId))].filter(id=>!names.has(id));
    for(let start=0;start<missing.length;start+=100){const refs=await this.catalog(missing.slice(start,start+100));for(const ref of refs){if(!ref.available||!ref.nameVi)reject(422,'EXERCISE_UNAVAILABLE');names.set(ref.exerciseId,ref.nameVi);}}
    if(sets.some(s=>!names.has(s.exerciseId)))reject(422,'EXERCISE_UNAVAILABLE');return names;
  }
  async create(owner:string,key:string,input:LogInput,bearer:string){
    const digest=fingerprint(input),prior=await this.replay(this.db,owner,key,digest);if(prior)return prior;
    await this.occurrenceFree(this.db,owner,input.occurrenceId);this.future(input);
    const snapshot=input.occurrenceId?await this.workout(input.occurrenceId,bearer):{};
    const names=await this.names(input.sets,[],snapshot);
    try{return await this.db.transaction(async db=>{
      await lockOwner(db,owner);const prior=await this.replay(db,owner,key,digest);if(prior)return prior;
      await this.occurrenceFree(db,owner,input.occurrenceId);
      const id=randomUUID();await db.query(`INSERT INTO workout_logs(id,owner_user_id,occurrence_id,performed_at,duration_seconds,notes,source_type,source_snapshot)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,owner,input.occurrenceId??null,input.performedAt,input.durationSeconds??null,input.notes??null,input.occurrenceId?'OCCURRENCE':'MANUAL',JSON.stringify(snapshot)]);
      await saveSets(db,id,input.sets,names);const result=document(await owned(db,owner,id));
      await db.query("DELETE FROM progress_idempotency WHERE owner_user_id=$1 AND operation='log:create' AND key=$2 AND expires_at<=now()",[owner,key]);
      await db.query('INSERT INTO progress_idempotency(owner_user_id,key,fingerprint,log_id,response) VALUES($1,$2,$3,$4,$5)',[owner,key,digest,id,JSON.stringify(result)]);return result;
    });}catch(error){if((error as {constraint?:string}).constraint==='progress_occurrence_once')reject(409,'OCCURRENCE_ALREADY_LOGGED');throw error;}
  }
  async update(owner:string,id:string,version:number,input:LogInput){
    const previous=await owned(this.db,owner,id);if(previous.version!==version)reject(412,'VERSION_MISMATCH');
    if(input.occurrenceId!==undefined&&input.occurrenceId!==previous.occurrence_id)reject(409,'SOURCE_IMMUTABLE');this.future(input);
    const names=await this.names(input.sets,previous.sets,previous.source_snapshot);
    return this.db.transaction(async db=>{
      const current=await owned(db,owner,id,true);if(current.version!==version)reject(412,'VERSION_MISMATCH');
      await db.query('UPDATE workout_logs SET performed_at=$2,duration_seconds=$3,notes=$4,version=version+1,updated_at=now() WHERE id=$1',[id,input.performedAt,input.durationSeconds??null,input.notes??null]);
      await db.query('DELETE FROM log_exercises WHERE log_id=$1',[id]);await saveSets(db,id,input.sets,names);return document(await owned(db,owner,id));
    });
  }
  remove(owner:string,id:string,version:number){return this.db.transaction(async db=>{
    await lockOwner(db,owner);const row=await owned(db,owner,id,true,true);if(row.version!==version)reject(412,'VERSION_MISMATCH');if(row.deleted_at)return;
    await db.query("UPDATE workout_logs SET deleted_at=now(),version=version+1,updated_at=now(),notes=NULL,duration_seconds=NULL,source_snapshot='{}'::jsonb WHERE id=$1",[id]);
    await db.query('DELETE FROM log_exercises WHERE log_id=$1',[id]);await db.query('UPDATE progress_idempotency SET response=NULL WHERE log_id=$1',[id]);
  });}
  async list(owner:string,query:Record<string,unknown>){
    if(Object.keys(query).some(k=>!['from','to','exerciseId','limit','cursor'].includes(k))||Object.values(query).some(v=>typeof v!=='string'))reject(400,'BAD_REQUEST');
    const from=query.from===undefined?null:timestamp(query.from,'BAD_REQUEST'),to=query.to===undefined?null:timestamp(query.to,'BAD_REQUEST');
    if(from&&to&&Date.parse(from)>=Date.parse(to))reject(400,'BAD_REQUEST');
    if(query.exerciseId!==undefined&&!/^[a-z][a-z0-9_]{0,79}$/.test(String(query.exerciseId)))reject(400,'BAD_REQUEST');
    const limit=Number(query.limit??20);if(!/^[1-9][0-9]{0,2}$/.test(String(query.limit??20))||limit>100)reject(400,'BAD_REQUEST');
    const scope=fingerprint([owner,from,to,query.exerciseId??null,limit]);let after:{id:string;at:string}|undefined;
    if(query.cursor!==undefined)try{
      if(!/^[A-Za-z0-9_-]{1,1024}$/.test(String(query.cursor)))throw Error();const data=JSON.parse(Buffer.from(String(query.cursor),'base64url').toString());
      if(data.scope!==scope||typeof data.id!=='string'||!uuid.test(data.id)||typeof data.at!=='string'||timestamp(data.at,'BAD_REQUEST')!==data.at)throw Error();after=data;
    }catch{reject(400,'INVALID_CURSOR');}
    const rows=(await this.db.query<Row>(select+` WHERE l.owner_user_id=$1 AND l.deleted_at IS NULL AND ($2::timestamptz IS NULL OR l.performed_at>=$2)
      AND ($3::timestamptz IS NULL OR l.performed_at<$3) AND ($4::text IS NULL OR EXISTS(SELECT 1 FROM log_exercises e WHERE e.log_id=l.id AND e.exercise_id=$4))
      AND ($5::timestamptz IS NULL OR (l.performed_at,l.id)<($5::timestamptz,$6::uuid)) ORDER BY l.performed_at DESC,l.id DESC LIMIT $7`,
    [owner,from,to,query.exerciseId??null,after?.at??null,after?.id??null,limit+1])).rows;
    const items=rows.slice(0,limit).map(document),last=items.at(-1);
    return {items,nextCursor:rows.length>limit?Buffer.from(JSON.stringify({scope,id:last!.id,at:last!.performedAt})).toString('base64url'):null};
  }
}
