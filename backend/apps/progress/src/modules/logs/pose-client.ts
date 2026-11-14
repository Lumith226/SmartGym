import {readFile} from 'node:fs/promises';
import {request} from 'node:https';
import {reject,valid} from '../../contract.js';
export type PoseResult={id:string;source:'LIVE'|'VIDEO';exerciseId:string;modelVersion:string;configVersion:string;repCount:number|null;repCountStatus:'AVAILABLE'|'UNAVAILABLE';formStatus:'ASSESSED'|'INSUFFICIENT_EVIDENCE'|'UNSUPPORTED';reps:unknown[];limitations:string[];completedAt:string;expiresAt:string};
export type ImportedPoseSummary=Omit<Pick<PoseResult,'id'|'source'|'exerciseId'|'modelVersion'|'configVersion'|'repCount'|'repCountStatus'|'formStatus'|'completedAt'|'expiresAt'>,'repCount'|'repCountStatus'>&{repCount:number;repCountStatus:'AVAILABLE'};
export type PoseClient=(id:string,bearer:string)=>Promise<PoseResult>;
export const unavailablePose:PoseClient=async()=>reject(503,'POSE_UNAVAILABLE');
export async function loadPoseClient():Promise<PoseClient>{
  const origin=process.env.PROGRESS_POSE_ORIGIN;if(!origin)return unavailablePose;
  if(new URL(origin).origin!==origin||new URL(origin).protocol!=='https:')throw Error('Pose HTTPS origin required');
  const [key,cert,ca]=await Promise.all(['KEY','CERT','CA'].map(field=>{const path=process.env['PROGRESS_POSE_TLS_'+field+'_FILE'];if(!path)throw Error('Missing Pose certificate');return readFile(path,'utf8');}));
  return async(id,bearer)=>{
    const result=await new Promise<{status:number;body:unknown}>((resolve,fail)=>{
      const req=request(new URL('/internal/v1/pose/results/'+id.toLowerCase(),origin),{key,cert,ca,method:'GET',agent:false,signal:AbortSignal.timeout(3000),headers:{accept:'application/json',authorization:bearer}},res=>{
        const chunks:Buffer[]=[];let size=0;res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>262144)req.destroy(Error('Pose response too large'));else chunks.push(chunk);});res.on('error',fail);
        res.on('end',()=>{try{if(res.headers['cache-control']!=='no-store'||!/^application\/(?:json|problem\+json)(?:;|$)/i.test(res.headers['content-type']??''))throw Error();resolve({status:res.statusCode??503,body:JSON.parse(Buffer.concat(chunks).toString())});}catch(error){fail(error);}});
      });req.on('error',fail);req.end();
    }).catch(()=>reject(503,'POSE_UNAVAILABLE'));
    if(valid('Problem',result.body)){
      if(result.status===404)reject(404,'NOT_FOUND');if(result.status===410)reject(410,'RESULT_EXPIRED');if(result.status===401)reject(401,'UNAUTHENTICATED');
    }
    if(result.status!==200||!valid('PoseResult',result.body)||(result.body as PoseResult).id.toLowerCase()!==id.toLowerCase())reject(503,'POSE_UNAVAILABLE');
    return result.body as PoseResult;
  };
}
