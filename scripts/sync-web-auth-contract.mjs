import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url),api=JSON.parse(await readFile(new URL('docs/api/openapi.yaml',root),'utf8'));
const names=new Set(['Profile','Problem','IdentityAssertion','IdentityIntrospection']),operations={};
for(const[path,item]of Object.entries(api.paths))if(path.startsWith('/api/v1/auth/')||path==='/api/v1/me')for(const[method,operation]of Object.entries(item)){
  // Google routes handle browser redirects directly rather than JSON proxying.
  if (['startGoogleLogin','finishGoogleLogin'].includes(operation.operationId)) continue;
  const request=operation.requestBody?.content?.['application/json']?.schema?.$ref?.split('/').at(-1)??null;
  const success=Object.entries(operation.responses).find(([code])=>code.startsWith('2'));
  const response=success[1].content?.['application/json']?.schema?.$ref?.split('/').at(-1)??null;
  if(request)names.add(request);if(response)names.add(response);
  operations[method.toUpperCase()+' '+path]={request,response,success:Number(success[0]),errors:Object.keys(operation.responses).filter(code=>!code.startsWith('2')).map(Number),cookie:operation.operationId==='login'?'session':['logout','resetPassword'].includes(operation.operationId)?'clear':null};
}
const output=JSON.stringify({schemas:Object.fromEntries([...names].map(name=>[name,api.components.schemas[name]])),operations},null,2)+'\n';
const target=new URL('frontend/data/auth-contracts.json',root);
if(process.argv.includes('--check')){
  if((await readFile(target,'utf8')).replaceAll('\r\n','\n')!==output)throw new Error('Stale Web auth contracts');
  console.log('Web auth schemas and operations match OpenAPI');
}else{await mkdir(new URL('./',target),{recursive:true});await writeFile(target,output);}
