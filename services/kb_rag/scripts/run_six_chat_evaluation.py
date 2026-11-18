"""Run real HTTP chat turns and preserve every output, including failures."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,json,time,re,sys,hashlib,collections,ssl
import httpx
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from kb_service.config import Settings

parser=argparse.ArgumentParser();parser.add_argument('--pilot',action='store_true');parser.add_argument('--ids');parser.add_argument('--url',default='http://127.0.0.1:8011');parser.add_argument('--chat-url')
parser.add_argument('--tls-ca',type=Path);parser.add_argument('--tls-cert',type=Path);parser.add_argument('--tls-key',type=Path);parser.add_argument('--token-file',type=Path)
args=parser.parse_args();s=Settings.from_env()
corpus=json.loads((ROOT/'evaluation/six_exercises_20261117/cases.json').read_text(encoding='utf-8'))
cases=corpus['cases']
if args.pilot and not args.ids:cases=[c for c in cases if c['split']=='development' or c['id'] in ['COMPARE_15','HIGH_KNEES_K08','JUMPING_JACK_K06','HIGH_KNEES_KNOWLEDGE_OBS','MEASUREMENT_UNITS']]
if args.ids:
 selected=set(args.ids.split(','));by_case={c['id']:c for c in corpus['cases']}
 unknown=selected-set(by_case)
 if unknown:raise ValueError('Unknown case IDs: '+', '.join(sorted(unknown)))
 while True:
  parents={by_case[key]['depends_on'] for key in selected if by_case[key].get('depends_on')}
  if parents.issubset(selected):break
  selected.update(parents)
 cases=[c for c in corpus['cases'] if c['id'] in selected]
stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
out=ROOT/'artifacts/six_exercises_20261117'/('pilot_'+stamp if args.pilot else 'run_'+stamp);out.mkdir(parents=True)
catalog=json.loads((ROOT/'label_catalog_v4.json').read_text(encoding='utf-8'))['exercises']
focus={'SQUAT':'back_not_straight','PUSHUP':'elevated_hips','JUMPING_JACK':'not_synchronized',
       'REVERSE_CRUNCH':'not_raising_hips','HIGH_KNEES':'not_straight','BUTT_KICKERS':'bringing_knees_forward'}
def fixture(code,index=1):
 spec=catalog[code]
 return {'observation_id':f'synthetic-{code}-{index}','source_id':f'synthetic-independent-{code}-{index}','simulated':True,
         'model_result':{'exercise':spec['model_exercise'],'schema_version':spec['schema_version'],
           'model_provenance':{'model_sha256':spec['model_sha256']},'scope':'video','quality':{'usable':True},
           'label_results':[{**x,'probability':1. if x['key']==focus[code] else 0.} for x in spec['labels']]}}
token=args.token_file.read_text(encoding='utf-8').strip() if args.token_file else s.internal_token
headers={'Authorization':'Bearer '+token} if token else {}
tls=ssl.create_default_context(cafile=str(args.tls_ca)) if args.tls_ca else True
if args.tls_cert:
 if not args.tls_ca or not args.tls_key:raise ValueError('mTLS requires CA, certificate and key')
 tls.load_cert_chain(str(args.tls_cert),str(args.tls_key))
outputs={};results=[]
with httpx.Client(timeout=360,headers=headers,verify=tls) as client:
 health_before=client.get(args.url+'/health').json()
 (out/'health_before.json').write_text(json.dumps(health_before,ensure_ascii=False,indent=2),encoding='utf-8')
 for i,case in enumerate(cases,1):
  body={'message':case['message'],'task':case['task'],'generate':True}
  parent=outputs.get(case.get('depends_on'))
  if parent:body['conversation']=[{'role':'user','content':parent['input']['message']},{'role':'assistant','content':parent['output'].get('reply','')}]
  if case.get('fixture'):
   code=case['exercise'];body['records']=[fixture(code)]
   if case['task'] in ['summary','practice']:body['records'].append(fixture(code,2))
   body['video_context']={'state':'attached'}
   if case['task']=='score':
    body.update(scoring_policy='SYNTHETIC_EVALUATION_ONLY_2_POINTS',rules=[{'exercise_code':code,'label_key':focus[code],'points':2}])
  started=time.perf_counter();row={'case':case,'input':body,'origin':'live_http_ollama_with_synthetic_model_records' if case.get('fixture') else 'live_http_ollama','run_id':stamp,'chat_endpoint':args.chat_url or args.url+'/v1/chatbot','runtime_revision':health_before.get('runtime_revision')}
  try:
   response=client.post(args.chat_url or args.url+'/v1/chatbot',json=body);row['http_status']=response.status_code
   data=response.json();row['output']=data
   evidence={x['chunk_id']:x for x in data.get('evidence',[])}
   checks={'http_ok':response.status_code==200,'nonempty_reply':bool(data.get('reply','').strip()),
    'provider_available':data.get('status')!='unavailable' and not any('ollama' in str(r.get('error','')).casefold() and 'unavailable' in str(r.get('error','')).casefold() for r in data.get('retrieval',{}).get('evidence_review',[])),
    'citations_in_evidence':all(cid in evidence for cid in data.get('citations',[])),
    'quotes_are_source_spans':all(q.get('chunk_id') in evidence and ' '.join(q['quote'].split()).casefold() in ' '.join(evidence[q['chunk_id']]['text'].split()).casefold()
       for q in data.get('retrieval',{}).get('support_quotes',[]))}
   if case['expected']=='short_social_no_retrieval':checks['social_skips_retrieval']=data.get('status')=='conversational' and not data.get('evidence')
   if case['expected']=='asks_for_observation':checks['requests_missing_observation']=data.get('status') in ['needs_clarification','insufficient_observation'] and not data.get('citations')
   if case['expected']=='out_of_scope':checks['outside_domain']=data.get('status')=='out_of_scope'
   if case['task']=='score':checks['ledger_exact']=data.get('session',{}).get('penalty_total')==2
   if case['task']=='summary':checks['two_independent_units']=len(data.get('session',{}).get('units',[]))==2
   if case.get('fixture'):checks['synthetic_origin_visible']='giả lập' in data.get('reply','').casefold()
   if case['expected']=='source_grounded':checks['has_source_citation']=bool(data.get('citations'))
   if case['expected']=='both_exercises_with_sources':
    checks['comparison_not_empty']=bool(data.get('citations'))
    checks['comparison_has_both_contexts']=set(case['exercise']).issubset(set(data.get('retrieval',{}).get('compared_exercises',[])))
   row['checks']=checks;row['mechanical_checks_pass']=all(checks.values())
   row['content_review']='pending_developer_read; mechanical checks do not establish factual accuracy'
  except Exception as e:row.update(error=type(e).__name__+': '+str(e),mechanical_checks_pass=False)
  row['seconds']=round(time.perf_counter()-started,3)
  outputs[case['id']]=row;results.append(row)
  with (out/'results.jsonl').open('a',encoding='utf-8') as f:f.write(json.dumps(row,ensure_ascii=False)+'\n')
  print(f"{i}/{len(cases)} {case['id']} {row.get('output',{}).get('status','ERROR')} {row['seconds']}s {str(row.get('output',{}).get('reply',''))[:180]}",flush=True)
 health_after=client.get(args.url+'/health').json()
 summary={'run_id':stamp,'cases':len(results),'mechanical_pass':sum(r['mechanical_checks_pass'] for r in results),
          'status_counts':dict(collections.Counter(r.get('output',{}).get('status','error') for r in results)),
          'health_before':health_before,'health_after':health_after,'same_runtime':health_before==health_after,
          'chat_endpoint':args.chat_url or args.url+'/v1/chatbot',
          'scope':'Live HTTP, real Ollama. Model observations are explicit synthetic fixtures. No independent expert assessment.'}
 (out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
 (out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'directory':str(out),**summary},ensure_ascii=False,indent=2),flush=True)
