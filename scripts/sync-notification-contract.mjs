import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../',import.meta.url);
const events = JSON.parse(await readFile(new URL('docs/api/events.yaml',root),'utf8'));
const api = JSON.parse(await readFile(new URL('docs/api/openapi.yaml',root),'utf8'));
const event = { $schema:events.$schema, $ref:'#/$defs/IdentityEmailActionRequested',
  $defs:{Envelope:events.$defs.Envelope,IdentityEmailActionRequested:events.$defs.IdentityEmailActionRequested} };
const occurrenceEvent = {$schema:events.$schema,$ref:'#/$defs/WorkoutOccurrenceChanged',
  $defs:{Envelope:events.$defs.Envelope,WorkoutOccurrenceChanged:events.$defs.WorkoutOccurrenceChanged}};
const schemaNames=new Set(['Jwks','NotificationPage','NotificationPreferences','Problem']);
for(const name of schemaNames)for(const match of JSON.stringify(api.components.schemas[name]).matchAll(/#\/components\/schemas\/(\w+)/g))schemaNames.add(match[1]);
const schemas=Object.fromEntries([...schemaNames].map(name=>[name,JSON.parse(JSON.stringify(api.components.schemas[name]).replaceAll('#/components/schemas/','#/$defs/'))]));
for(const [target,value]of [
  ['backend/services/notification/data/contracts.json',{event,occurrenceEvent,delivery:api.components.schemas.EmailDelivery,
    contact:api.components.schemas.NotificationContact,preferences:api.components.schemas.NotificationPreferencesUpdate,schemas}],
  ['backend/services/identity/data/email-event.schema.json',event],
]) {
  const url = new URL(target,root), output=JSON.stringify(value,null,2)+'\n';
  if(process.argv.includes('--check')) {
    if((await readFile(url,'utf8')).replaceAll('\r\n','\n')!==output)throw new Error('Stale generated contract '+target);
  } else {await mkdir(new URL('./',url),{recursive:true});await writeFile(url,output);}
}
console.log('Notification/relay contracts '+(process.argv.includes('--check')?'match source':'generated'));
