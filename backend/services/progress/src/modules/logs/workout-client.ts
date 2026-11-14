import { readFile } from 'node:fs/promises';
import { request } from 'node:https';
import { reject,valid } from '../../contract.js';
export type Occurrence={id:string;scheduleId:string;planId:string;version:number;status:'SCHEDULED'|'CANCELED';startAt:string;endAt:string;timeZone:string;plannedExercises:{exerciseId:string;exerciseNameVi:string}[]};
export type WorkoutClient=(id:string,bearer:string)=>Promise<Occurrence>;
export async function loadWorkoutClient():Promise<WorkoutClient>{
  const origin=process.env.PROGRESS_WORKOUT_ORIGIN;
  if(!origin||new URL(origin).origin!==origin||new URL(origin).protocol!=='https:')throw Error('Workout HTTPS origin required');
  const [key,cert,ca]=await Promise.all(['KEY','CERT','CA'].map(field=>{const path=process.env['PROGRESS_WORKOUT_TLS_'+field+'_FILE'];if(!path)throw Error('Missing Workout certificate');return readFile(path,'utf8');}));
  return async(id,bearer)=>{
    const result=await new Promise<{status:number;body:unknown}>((resolve,fail)=>{
      const req=request(new URL('/internal/v1/workout/occurrences/'+id.toLowerCase(),origin),{key,cert,ca,method:'GET',agent:false,signal:AbortSignal.timeout(3000),headers:{accept:'application/json',authorization:bearer}},res=>{
        const chunks:Buffer[]=[];let size=0;
        res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>65536)req.destroy(Error('Workout response too large'));else chunks.push(chunk);});res.on('error',fail);
        res.on('end',()=>{try{if(res.headers['cache-control']!=='no-store'||!/^application\/(?:json|problem\+json)(?:;|$)/i.test(res.headers['content-type']??''))throw Error();resolve({status:res.statusCode??503,body:JSON.parse(Buffer.concat(chunks).toString())});}catch(error){fail(error);}});
      });req.on('error',fail);req.end();
    }).catch(()=>reject(503,'WORKOUT_UNAVAILABLE'));
    if(result.status===404&&valid('Problem',result.body))reject(404,'NOT_FOUND');
    if(result.status===401&&valid('Problem',result.body))reject(401,'UNAUTHENTICATED');
    if(result.status!==200||!valid('WorkoutOccurrence',result.body)||(result.body as Occurrence).id.toLowerCase()!==id.toLowerCase())reject(503,'WORKOUT_UNAVAILABLE');
    return result.body as Occurrence;
  };
}
