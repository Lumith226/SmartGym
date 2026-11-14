import { readFile,writeFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url),api=JSON.parse(await readFile(new URL('docs/api/openapi.yaml',root),'utf8'));
const names=new Set(['Jwks','Problem','WorkoutLogInput','WorkoutLog','WorkoutLogPage','ProgressSummary','PoseResult','PoseResultImport','WorkoutOccurrence','ExerciseRefBatch','ExerciseRefList']);
for(const name of names)for(const match of JSON.stringify(api.components.schemas[name]).matchAll(/#\/components\/schemas\/(\w+)/g))names.add(match[1]);
const content=JSON.stringify({$id:'progress-contract',components:{schemas:Object.fromEntries([...names].map(name=>[name,api.components.schemas[name]]))}},null,2)+'\n';
const target=new URL('backend/services/progress/data/contracts.json',root);
if(process.argv.includes('--check')){if((await readFile(target,'utf8')).replaceAll('\r\n','\n')!==content)throw Error('Stale Progress contracts');console.log('Progress schemas match OpenAPI');}
else await writeFile(target,content);
