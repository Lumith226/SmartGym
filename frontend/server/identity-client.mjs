import {readFile} from 'node:fs/promises';
import {request} from 'node:https';
import {valid} from './contracts.mjs';
export const SESSION='__Host-sg_session';
export class AuthError extends Error{
  constructor(status=503,code='AUTH_UNAVAILABLE'){super(code);this.status=status;this.code=code;}
}
let configuration;
export function loadAuthConfig(){
  if(process.env.BFF_AUTH_ENABLED!=='true')return Promise.reject(new AuthError());
  return configuration??=readConfig();
}
async function readConfig(){
  const required=name=>{const value=process.env[name];if(!value)throw new AuthError();return value;};
  const webOrigin=required('BFF_WEB_ORIGIN'),identityOrigin=required('BFF_IDENTITY_ORIGIN');
  for(const value of [webOrigin,identityOrigin]){const url=new URL(value);if(url.protocol!=='https:'||url.origin!==value)throw new AuthError();}
  const [key,cert,ca]=await Promise.all(['BFF_IDENTITY_KEY_FILE','BFF_IDENTITY_CERT_FILE','BFF_IDENTITY_CA_FILE'].map(name=>readFile(required(name),'utf8')));
  return{webOrigin,identityOrigin,tls:{key,cert,ca}};
}
export function sessionCookie(header=''){
  const matches=header.split(';').map(part=>part.trim()).filter(part=>part.startsWith(SESSION+'='));
  if(matches.length>1)throw new AuthError(401,'UNAUTHENTICATED');
  const matched=matches[0];
  if(!matched)return undefined;
  const handle=matched.slice(SESSION.length+1);
  if(handle&&!/^[A-Za-z0-9_-]{43}$/.test(handle))throw new AuthError(401,'UNAUTHENTICATED');
  return handle?matched:undefined;
}
export const hasLegacySessionCookie = (header = '') => header.split(';').some(part => part.trim().startsWith('sg_session='));
export const clearLegacySessionCookie = 'sg_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
export async function identityRequest(config,path,{method='GET',body,cookie,ip,origin,csrf}={}){
  if(!['/api/v1/me','/internal/v1/identity/sessions/introspect','/internal/v1/identity/google-login'].includes(path)&&!/^\/api\/v1\/auth\/[a-z-]+$/.test(path))throw new AuthError();
  const payload=body===undefined?undefined:JSON.stringify(body);
  const headers={accept:'application/json',...(payload===undefined?{}:{'content-type':'application/json','content-length':String(Buffer.byteLength(payload))}),
    ...(cookie?{cookie}:{}),...(ip?{'x-smartgym-client-ip':ip}:{}),...(origin?{origin}:{}),...(csrf?{'x-smartgym-csrf':csrf}:{})};
  return new Promise((resolve,reject)=>{
    const req=request(new URL(path,config.identityOrigin),{...config.tls,method,headers,agent:false,signal:AbortSignal.timeout(5000)},res=>{
      let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;if(Buffer.byteLength(text)>32768)req.destroy(new Error('Response too large'));});
      res.on('error',()=>reject(new AuthError()));
      res.on('end',()=>{try{
        if(res.headers['cache-control']!=='no-store')throw new AuthError();
        if(text&&!res.headers['content-type']?.startsWith('application/json')&&!res.headers['content-type']?.startsWith('application/problem+json'))throw new AuthError();
        resolve({status:res.statusCode,body:text?JSON.parse(text):null,cookies:res.headers['set-cookie']??[],retryAfter:res.headers['retry-after']});
      }catch{reject(new AuthError());}});
    });req.on('error',()=>reject(new AuthError()));req.end(payload);
  });
}
async function verifiedSession(rawCookie){
  const cookie=sessionCookie(rawCookie);if(!cookie)throw new AuthError(401,'UNAUTHENTICATED');
  const config=await loadAuthConfig(),handle=cookie.slice(SESSION.length+1);
  const assertion=await identityRequest(config,'/internal/v1/identity/sessions/introspect',{method:'POST',body:{sessionHandle:handle}});
  if(assertion.status===401)throw new AuthError(401,'UNAUTHENTICATED');
  if(assertion.status!==200||!valid('IdentityAssertion',assertion.body)||!assertion.body.emailVerified||Date.parse(assertion.body.expiresAt)<=Date.now())throw new AuthError();
  return {config,cookie,assertion:assertion.body};
}
export async function assertionForSession(rawCookie){
  if(process.env.BFF_AUTH_ENABLED!=='true')throw new AuthError();
  const {assertion}=await verifiedSession(rawCookie);
  return assertion;
}
export async function adminAssertionForSession(rawCookie){
  if(process.env.BFF_AUTH_ENABLED!=='true')throw new AuthError();
  const {assertion}=await verifiedSession(rawCookie);
  if(!assertion.roles.includes('ADMIN'))throw new AuthError(403,'ADMIN_REQUIRED');
  return assertion.accessToken;
}
export async function profileForSession(rawCookie){
  const {config,cookie,assertion}=await verifiedSession(rawCookie);
  const profile=await identityRequest(config,'/api/v1/me',{cookie});
  if(profile.status===401)throw new AuthError(401,'UNAUTHENTICATED');
  if(profile.status!==200||!valid('Profile',profile.body)||!profile.body.emailVerified||profile.body.id!==assertion.userId||
    JSON.stringify(profile.body.roles)!==JSON.stringify(assertion.roles))throw new AuthError();
  return profile.body;
}
