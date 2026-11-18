"""Synthetic boundary checks for every label/scope; no vision accuracy claim."""
from pathlib import Path
from dataclasses import replace
import json,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from kb_service.config import Settings
from kb_service.engine import Engine
from kb_service.models import ModelChatRequest
from kb_service.v4 import adapt_model_request
from kb_service.chatbot import ChatbotRequest,answer_chatbot

def main():
 settings=replace(Settings.from_env(),index_dir=ROOT/'data/releases/six_exercises_20261118_r3',retrieval_mode='lexical')
 engine=Engine(settings);snap=engine.retriever.snapshot;rows=[]
 for code,spec in snap['label_catalog']['exercises'].items():
  for label in spec['labels']:
   base={'exercise':spec['model_exercise'],'schema_version':spec['schema_version'],
    'model_provenance':{'model_sha256':spec['model_sha256']},'quality':{'usable':True},
    'label_results':[{**x,'probability':1. if x['key']==label['key'] else 0.} for x in spec['labels']]}
   for scope in ['video','window','rep']:
    payload={**base,'scope':scope}
    observation=adapt_model_request(ModelChatRequest(model_result=payload,simulated=True,generate=False),snap).observation
    expected=label['calibrated'] and (scope=='video' or (label.get('window_supported',label['rep_supported']) if scope=='window' else label['rep_supported']))
    rows.append({'exercise':code,'label':label['key'],'kind':label['kind'],'scope':scope,'test':'activation_uses_registered_scope',
      'pass':observation.labels==([label['key']] if expected else []),'origin':'synthetic_one_active_label'})
   body=ChatbotRequest(message='Synthetic ledger contract test, not a coaching question.',task='score',generate=False,
    records=[{'observation_id':'synthetic-'+code+'-'+label['key'],'source_id':'synthetic-'+code+'-'+label['key'],
              'simulated':True,'model_result':{**base,'scope':'video'}}],
    rules=[{'exercise_code':code,'label_key':label['key'],'points':2}],scoring_policy='SYNTHETIC_EVALUATION_ONLY_2_POINTS')
   if label['kind']=='error':
    result=answer_chatbot(engine,body)
    rows.append({'exercise':code,'label':label['key'],'test':'demo_ledger_for_registered_error_only','pass':result['session']['penalty_total']==(2 if label['calibrated'] else 0),'origin':'synthetic_one_active_label'})
   else:
    rejected=False
    try:answer_chatbot(engine,body)
    except ValueError:rejected=True
    rows.append({'exercise':code,'label':label['key'],'test':'non_error_penalty_rejected','pass':rejected,'origin':'synthetic_one_active_label'})
 out=ROOT/'artifacts/six_exercises_20261117/releases'/snap['version']/'adapter_matrix.json'
 data={'kb_version':snap['version'],'n':len(rows),'passed':sum(r['pass'] for r in rows),'details':rows,
  'scope':'Synthetic schema/scope/ledger checks across 128 labels. No images, no vision accuracy or answer-quality evaluation.'}
 out.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({k:v for k,v in data.items() if k!='details'}))
 if data['n']!=data['passed']:raise SystemExit(1)
if __name__=='__main__':main()
