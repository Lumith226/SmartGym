import { readFile } from 'node:fs/promises';
import { request } from 'node:https';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import contract from '../data/progress-contracts.json' with {type:'json'};
import { AuthError,assertionForSession } from './identity-client.mjs';
import { problem,readJson,requireSameOrigin } from './auth.mjs';
const ajv=new Ajv2020({strict:false});addFormats(ajv);ajv.addSchema({$id:'web-progress',$defs:contract.schemas});
const valid=(name,value)=>ajv.getSchema('web-progress#/$defs/'+name)(value);
const operations=contract.operations.map(op=>({...op,
  pattern:new RegExp('^'+op.path.replace(/\{(\w+)\}/g,'(?<$1>[A-Za-z0-9-]+)')+'$'),
  pathValid:ajv.compile({type:'object',properties:op.paths,required:Object.keys(op.paths),additionalProperties:false}),
  queryValid:ajv.compile({type:'object',properties:op.queries,required:op.requiredQueries,additionalProperties:false}),
  headerValid:ajv.compile({type:'object',properties:op.headers,required:Object.keys(op.headers),additionalProperties:false}),
}));
const codes=new Set(['NOT_FOUND','BAD_REQUEST','INVALID_CURSOR','INVALID_ETAG','INVALID_IDEMPOTENCY_KEY','VALIDATION_ERROR','PRECONDITION_REQUIRED','VERSION_MISMATCH',
  'IDEMPOTENCY_CONFLICT','EXERCISE_UNAVAILABLE','SOURCE_IMMUTABLE','OCCURRENCE_ALREADY_LOGGED','LOG_DELETED','DUPLICATE_SET','PERFORMED_AT_IN_FUTURE',
  'INVALID_SUMMARY_RANGE','UNAUTHENTICATED','IDENTITY_UNAVAILABLE','WORKOUT_UNAVAILABLE','CATALOG_UNAVAILABLE','SUMMARY_UNAVAILABLE','RATE_LIMITED',
  'POSE_RESULT_ALREADY_IMPORTED','POSE_UNAVAILABLE','NO_LOGGABLE_RESULT','RESULT_EXPIRED']);
const unavailable=()=>new AuthError(503,'PROGRESS_UNAVAILABLE');let configuration;
function loadConfig(){return configuration??=(async()=>{
  const origin=process.env.BFF_PROGRESS_ORIGIN,url=origin&&URL.parse(origin);if(!url||url.origin!==origin||url.protocol!=='https:')throw unavailable();
  const [key,cert,ca]=await Promise.all(['KEY','CERT','CA'].map(field=>readFile(process.env['BFF_PROGRESS_'+field+'_FILE'],'utf8')));return {origin,tls:{key,cert,ca}};
})();}
function forward(config,path,method,token,headers,body,byteLimit){const payload=body===undefined?undefined:JSON.stringify(body);return new Promise((resolve,reject)=>{
  const req=request(new URL(path,config.origin),{...config.tls,method,agent:false,signal:AbortSignal.timeout(7000),headers:{accept:'application/json',authorization:'Bearer '+token,...headers,...(payload===undefined?{}:{'content-type':'application/json','content-length':Buffer.byteLength(payload)})}},res=>{
    let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>byteLimit)req.destroy(unavailable());else chunks.push(chunk);});res.on('error',()=>reject(unavailable()));
    res.on('end',()=>{try{const text=Buffer.concat(chunks).toString();if(res.headers['cache-control']!=='no-store'||(res.statusCode!==204&&!/^application\/(?:json|problem\+json)(?:;|$)/i.test(res.headers['content-type']??'')))throw unavailable();resolve({status:res.statusCode,headers:res.headers,body:text?JSON.parse(text):null});}catch{reject(unavailable());}});
  });req.on('error',()=>reject(unavailable()));req.end(payload);
});}
export async function handleProgress(req,res,webOrigin){try{
  requireSameOrigin(req,webOrigin);if(req.url.length>8192)throw new AuthError(400,'BAD_REQUEST');
  const url=new URL(req.url,webOrigin),op=operations.find(o=>o.method===req.method&&o.pattern.test(url.pathname)&&o.pathValid(o.pattern.exec(url.pathname).groups??{}));
  if(!op)throw new AuthError(404,'NOT_FOUND');
  const token=(await assertionForSession(req.headers.cookie??'')).accessToken,query=Object.create(null);
  for(const [k,v]of url.searchParams){if(!Object.hasOwn(op.queries,k)||Object.hasOwn(query,k))throw new AuthError(400,'BAD_REQUEST');query[k]=op.queries[k].type==='integer'&&/^[1-9][0-9]*$/.test(v)?Number(v):v;}
  if(!op.queryValid(query))throw new AuthError(400,'BAD_REQUEST');
  const headers=Object.fromEntries(Object.keys(op.headers).filter(k=>req.headers[k]!==undefined).map(k=>[k,req.headers[k]]));
  if(op.headers['if-match']&&headers['if-match']===undefined)throw new AuthError(428,'PRECONDITION_REQUIRED');if(!op.headerValid(headers))throw new AuthError(400,'BAD_REQUEST');
  let body;if(req.method!=='GET'&&(op.input||Number(req.headers['content-length'])>0||req.headers['transfer-encoding'])){
    if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new AuthError(400,'BAD_REQUEST');body=await readJson(req,65536);
    if(op.input?!valid(op.input,body):!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length)throw new AuthError(422,'VALIDATION_ERROR');
  }
  const budget=(op.output==='WorkoutLogPage'?Number(query.limit??20):1)*256*1024;
  const upstream=await forward(await loadConfig(),url.pathname+url.search,req.method,token,headers,body,budget);
  if(upstream.status!==op.status){
    if(!op.errors.includes(upstream.status)||!valid('Problem',upstream.body))throw unavailable();const code=codes.has(upstream.body.code)?upstream.body.code:'PROGRESS_UNAVAILABLE';
    const existing=['OCCURRENCE_ALREADY_LOGGED','POSE_RESULT_ALREADY_IMPORTED'].includes(code)&&typeof upstream.body.detail==='string'?/^Nhật ký đã có: (\/api\/v1\/progress\/logs\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.exec(upstream.body.detail)?.[1]:undefined;
    if(upstream.status===429&&/^\d{1,5}$/.test(upstream.headers['retry-after']??''))res.setHeader('Retry-After',upstream.headers['retry-after']);problem(res,upstream.status,code,existing);return;
  }
  if(op.output?!valid(op.output,upstream.body):upstream.body!==null)throw unavailable();
  if(op.name==='importPoseResult'&&(upstream.body.source!=='POSE'||upstream.body.poseResultId!==body.poseResultId.toLowerCase()||upstream.body.poseSummary?.id!==upstream.body.poseResultId))throw unavailable();
  const output={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff',...(op.output?{'content-type':'application/json; charset=utf-8'}:{})};
  if(op.etag){if(!/^"v[1-9][0-9]{0,9}"$/.test(upstream.headers.etag??''))throw unavailable();output.ETag=upstream.headers.etag;}
  if(op.location){const base=op.name==='importPoseResult'?'/api/v1/progress/logs':op.path;if(upstream.headers.location!==base+'/'+upstream.body.id)throw unavailable();output.Location=upstream.headers.location;}
  res.writeHead(op.status,output);res.end(op.output?JSON.stringify(upstream.body):undefined);
}catch(error){const safe=error instanceof AuthError?error:unavailable();problem(res,safe.status,safe.code);}}
