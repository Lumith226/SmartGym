import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),api=JSON.parse(await readFile(new URL('docs/api/openapi.yaml',root),'utf8'));
const names=new Set(['ChatRequest','ChatAnswer','PoseRawResultEnvelope']);
for(const name of names){if(!api.components.schemas[name])throw Error('Missing schema '+name);for(const ref of JSON.stringify(api.components.schemas[name]).matchAll(/#\/components\/schemas\/(\w+)/g))names.add(ref[1]);}
const schemas=Object.fromEntries([...names].map(n=>[n,JSON.parse(JSON.stringify(api.components.schemas[n]).replaceAll('#/components/schemas/','#/$defs/'))]));
const handoff=JSON.parse(await readFile(new URL('docs/api/ai-provider-compatibility.yaml',root),'utf8'));
const result=JSON.stringify({schemas,models:handoff.models.map(m=>({catalogId:m.catalog_id,exercise:m.pose_id??m.pose_exercise,schemaVersion:m.schema_version,sha256:m.model_sha256}))},null,2)+'\n';
const file=new URL('frontend/data/chat-contracts.json',root);
if(process.argv.includes('--check')){if((await readFile(file,'utf8')).replaceAll('\r\n','\n')!==result)throw Error('Stale Web chat contracts');console.log('Web chat contracts match OpenAPI/provider manifest');}else await writeFile(file,result);
