import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),api=JSON.parse(await readFile(new URL('docs/api/openapi.yaml',root),'utf8')),events=JSON.parse(await readFile(new URL('docs/api/events.yaml',root),'utf8'));
const names=new Set(['CatalogHead','CatalogSnapshot']);for(const n of names)for(const m of JSON.stringify(api.components.schemas[n]).matchAll(/#\/components\/schemas\/(\w+)/g))names.add(m[1]);
const schemas=Object.fromEntries([...names].map(n=>[n,JSON.parse(JSON.stringify(api.components.schemas[n]).replaceAll('#/components/schemas/','#/$defs/'))]));
const eventNames=['CatalogExercisePublished','CatalogExerciseUpdated','CatalogExerciseUnpublished'];
const event={$schema:events.$schema,oneOf:eventNames.map(n=>({$ref:'#/$defs/'+n})),$defs:events.$defs};
const output=JSON.stringify({schemas,event},null,2)+'\n',file=new URL('backend/services/catalog/data/feed-contracts.json',root);
if(process.argv.includes('--check')){if((await readFile(file,'utf8')).replaceAll('\r\n','\n')!==output)throw Error('Stale Catalog feed contracts');console.log('Catalog feed contracts match sources');}else await writeFile(file,output);
