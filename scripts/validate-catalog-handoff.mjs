import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),read=async name=>JSON.parse(await readFile(new URL(name,root),'utf8'));
const [h,api,events]=await Promise.all([read('docs/api/catalog-rag-handoff.yaml'),read('docs/api/openapi.yaml'),read('docs/api/events.yaml')]);
const must=(condition,message)=>{if(!condition)throw Error('Catalog handoff: '+message);};
must(h.version===1&&h.producer.migration===8,'version/migration mismatch');
for(const op of h.producer.operations){const actual=api.paths[op.path]?.[op.method.toLowerCase()];must(actual?.operationId===op.operationId,'operation mismatch '+op.operationId);must(actual.responses['200'].content['application/json'].schema.$ref==='#/components/schemas/'+op.schema,'schema mismatch');must(actual['x-backend-allowed-callers']?.join(',')==='rag','caller mismatch');must(actual.responses['200'].headers['Cache-Control'].schema.const==='no-store','privacy header missing');}
const declared=Object.values(events.$defs).flatMap(v=>v.allOf??[]).map(v=>v.properties?.type?.const).filter(v=>typeof v==='string'&&v.startsWith('catalog.exercise.'));
must(JSON.stringify([...h.producer.events.routingKeys].sort())===JSON.stringify(declared.sort()),'routing keys drift');
must(h.producer.auth.transport==='mTLS'&&!h.producer.auth.endUserJwt&&!h.producer.auth.databaseAccess&&!h.producer.auth.bffCertificateAllowed,'security boundary drift');
for(const [field,key]of [['maxExercises','exercises'],['maxSources','sources'],['maxTombstones','tombstones']])must(api.components.schemas.CatalogSnapshot.properties[key].maxItems===h.producer.snapshots[field],'snapshot limit drift');
must(h.producer.snapshots.encoding==='UTF-8'&&h.producer.events.delivery==='AT_LEAST_ONCE','wire policy drift');
must(h.consumerPolicy.pollHeadSeconds>0&&h.consumerPolicy.maximumHeadAgeSeconds>=h.consumerPolicy.pollHeadSeconds,'invalid freshness budgets');
must(new Set(h.acceptance.map(a=>a.id)).size===h.acceptance.length&&h.acceptance.length>=5,'missing acceptance gates');
if(h.status==='PRODUCER_LOCAL_ONLY')must(h.provider.agreement==='UNCONFIRMED'&&h.provider.stagingEvidence===null&&h.producer.providerExecuted===false,'local proof overclaims provider readiness');
else{must(h.status==='FULLY_VERIFIED','unknown status');must(h.provider.agreement==='ACKNOWLEDGED'&&h.provider.acceptedBy&&h.provider.acceptedRuntimeRevision&&h.provider.acknowledgementEvidence&&h.provider.stagingEvidence,'provider/staging evidence required');must(h.acceptance.every(a=>a.status==='PASS'),'unmet acceptance gate');}
console.log('Catalog handoff references/security/limits/status consistent; provider agreement '+h.provider.agreement);
