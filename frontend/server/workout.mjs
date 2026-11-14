import { readFile } from 'node:fs/promises';
import { request } from 'node:https';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import contract from '../data/workout-contracts.json' with { type: 'json' };
import { AuthError, assertionForSession } from './identity-client.mjs';
import { problem, readJson, requireSameOrigin } from './auth.mjs';

const ajv = new Ajv2020({ strict: false }); addFormats(ajv);
ajv.addSchema({ $id: 'web-workout', $defs: contract.schemas });
const valid = (name, value) => ajv.getSchema('web-workout#/$defs/' + name)(value);
const operations = contract.operations.map(op => ({ ...op,
  pattern: new RegExp('^' + op.path.replace(/\{(\w+)\}/g, '(?<$1>[A-Za-z0-9-]+)') + '$'),
  pathValid: ajv.compile({ type: 'object', properties: op.paths, required: Object.keys(op.paths), additionalProperties: false }),
  queryValid: ajv.compile({ type: 'object', properties: op.queries, required: op.requiredQueries, additionalProperties: false }),
  headerValid: ajv.compile({ type: 'object', properties: op.headers, required: Object.keys(op.headers), additionalProperties: false }),
}));
const codes = new Set(['NOT_FOUND','BAD_REQUEST','INVALID_CURSOR','INVALID_ETAG','INVALID_IDEMPOTENCY_KEY','VALIDATION_ERROR',
  'PRECONDITION_REQUIRED','VERSION_MISMATCH','IDEMPOTENCY_CONFLICT','REQUEST_IN_PROGRESS','EXERCISE_UNAVAILABLE',
  'PLAN_ARCHIVED','ACTIVE_SCHEDULE_EXISTS','INVALID_SCHEDULE','SCHEDULE_IN_PAST','SCHEDULE_OVERLAP','SCHEDULE_CANCELED',
  'OCCURRENCE_CANCELED','OCCURRENCE_STARTED','INVALID_OCCURRENCE','UNAUTHENTICATED','IDENTITY_UNAVAILABLE','CATALOG_UNAVAILABLE','RATE_LIMITED']);
const unavailable = () => new AuthError(503, 'WORKOUT_UNAVAILABLE');
let configuration;
function loadConfig() {
  return configuration ??= (async () => {
    const origin = process.env.BFF_WORKOUT_ORIGIN, url = origin && URL.parse(origin);
    if (!url || url.origin !== origin || url.protocol !== 'https:') throw unavailable();
    const [key,cert,ca] = await Promise.all(['KEY','CERT','CA'].map(field => readFile(process.env['BFF_WORKOUT_' + field + '_FILE'], 'utf8')));
    return { origin, tls: { key,cert,ca } };
  })();
}
function forward(config, path, method, token, headers, body) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve,reject) => {
    const req = request(new URL(path,config.origin), { ...config.tls, method, agent:false, signal:AbortSignal.timeout(7000),
      headers: { accept:'application/json', authorization:'Bearer ' + token, ...headers,
        ...(payload === undefined ? {} : { 'content-type':'application/json','content-length':Buffer.byteLength(payload) }) } }, res => {
      const chunks=[];let size=0;
      res.on('data',chunk => { size+=chunk.length; if(size>2*1024*1024)req.destroy(unavailable());else chunks.push(chunk); });
      res.on('error',()=>reject(unavailable()));
      res.on('end',()=>{try{
        const text=Buffer.concat(chunks).toString();
        if(res.headers['cache-control']!=='no-store' || (res.statusCode!==204 && !/^application\/(json|problem\+json)(;|$)/i.test(res.headers['content-type']??'')))throw unavailable();
        resolve({status:res.statusCode,headers:res.headers,body:text?JSON.parse(text):null});
      }catch{reject(unavailable());}});
    });req.on('error',()=>reject(unavailable()));req.end(payload);
  });
}
async function publicExercises(query) {
  const origin=process.env.CATALOG_URL??'http://127.0.0.1:3001', url=URL.parse(origin);
  if(!url || url.origin!==origin || !['http:','https:'].includes(url.protocol))throw unavailable();
  const res=await fetch(origin+'/api/v1/exercises'+query,{redirect:'manual',signal:AbortSignal.timeout(3000)});
  let size=0;const chunks=[];
  for await(const chunk of res.body??[]){size+=chunk.length;if(size>2*1024*1024)throw unavailable();chunks.push(chunk);}
  if(res.status!==200)throw unavailable();
  const {items,nextCursor}=JSON.parse(Buffer.concat(chunks).toString());
  const summaries=items.map(({id,slug,nameVi,nameEn,summary,primaryMuscleIds,equipmentIds,media})=>
    ({id,slug,nameVi,nameEn,summary,primaryMuscleIds,equipmentIds,media}));
  return {status:200,headers:{},body:{items:summaries,nextCursor}};
}
export async function handleWorkout(req,res,webOrigin) {
  try {
    if(webOrigin)requireSameOrigin(req,webOrigin);
    if(req.url.length>8192)throw new AuthError(400,'BAD_REQUEST');
    const url=new URL(req.url,webOrigin??'http://localhost');
    const op=operations.find(op=>op.method===req.method && op.pattern.test(url.pathname) && op.pathValid(op.pattern.exec(url.pathname).groups??{}));
    if(!op)throw new AuthError(404,'NOT_FOUND');
    if(!op.public && !webOrigin)throw unavailable();
    const token=op.public?undefined:(await assertionForSession(req.headers.cookie??'')).accessToken;
    const queries=Object.create(null);
    for(const [key,value] of url.searchParams){
      if(!Object.hasOwn(op.queries,key)||Object.hasOwn(queries,key))throw new AuthError(400,'BAD_REQUEST');
      queries[key]=op.queries[key].type==='integer'&&/^[1-9][0-9]*$/.test(value)?Number(value):value;
    }
    if(!op.queryValid(queries))throw new AuthError(400,'BAD_REQUEST');
    const headers=Object.fromEntries(Object.keys(op.headers).filter(key=>req.headers[key]!==undefined).map(key=>[key,req.headers[key]]));
    if(op.headers['if-match'] && headers['if-match']===undefined)throw new AuthError(428,'PRECONDITION_REQUIRED');
    if(!op.headerValid(headers))throw new AuthError(400,'BAD_REQUEST');
    let body;
    if(req.method!=='GET'){
      const hasBody=Number(req.headers['content-length'])>0 || req.headers['transfer-encoding'];
      if(op.input || hasBody){
        if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new AuthError(400,'BAD_REQUEST');
        body=await readJson(req,64*1024);
        if(op.input?!valid(op.input,body):!body || Array.isArray(body)||typeof body!=='object'||Object.keys(body).length)throw new AuthError(422,'VALIDATION_ERROR');
      }
    }
    const query=url.searchParams.size?'?'+url.searchParams.toString():'';
    const upstream=op.public?await publicExercises(query):await forward(await loadConfig(),url.pathname+query,req.method,token,headers,body);
    if(upstream.status!==op.status){
      if(!op.errors.includes(upstream.status)||!valid('Problem',upstream.body))throw unavailable();
      const code=codes.has(upstream.body.code)?upstream.body.code:'WORKOUT_UNAVAILABLE';
      const detail=code==='SCHEDULE_OVERLAP'&&typeof upstream.body.detail==='string'?upstream.body.detail.slice(0,512):undefined;
      if(upstream.status===429 && /^\d{1,5}$/.test(upstream.headers['retry-after']??''))res.setHeader('Retry-After',upstream.headers['retry-after']);
      problem(res,upstream.status,code,detail);return;
    }
    if(op.output?!valid(op.output,upstream.body):upstream.body!==null)throw unavailable();
    const output={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
    if(op.output)output['content-type']='application/json; charset=utf-8';
    if(op.etag){if(!/^"v[1-9][0-9]{0,9}"$/.test(upstream.headers.etag??''))throw unavailable();output.ETag=upstream.headers.etag;}
    if(op.location){
      if(upstream.headers.location!==op.path+'/'+upstream.body.id)throw unavailable();
      output.Location=upstream.headers.location;
    }
    res.writeHead(op.status,output);res.end(op.output?JSON.stringify(upstream.body):undefined);
  } catch(error){const safe=error instanceof AuthError?error:unavailable();problem(res,safe.status,safe.code);}
}
