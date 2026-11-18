"""Explicit local release pointer, with validation and rollback metadata."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,json,sys,hashlib
from dotenv import dotenv_values,set_key
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))

def main():
 p=argparse.ArgumentParser();p.add_argument('--action',choices=['validate','activate','rollback'],default='validate');p.add_argument('--evaluation-run',type=Path);p.add_argument('--chat-model');a=p.parse_args()
 env_path=ROOT/'.env';metadata=ROOT/'artifacts/six_exercises_20261117/activation.json'
 if a.action=='rollback':
  prior=json.loads(metadata.read_text(encoding='utf-8'))['previous_config']
  set_key(str(env_path),'KB_INDEX_DIR',prior['KB_INDEX_DIR']);set_key(str(env_path),'KB_GRAPH_BACKEND',prior['KB_GRAPH_BACKEND'])
  set_key(str(env_path),'OLLAMA_CHAT_MODEL',prior.get('OLLAMA_CHAT_MODEL','qwen3:8b'))
  print(json.dumps({'action':'rollback_pointer','restart_required':True,'index':prior['KB_INDEX_DIR']}));return
 index=ROOT/'data/releases/six_exercises_20261118_r3'
 snap=json.loads((index/'snapshot.json').read_text(encoding='utf-8'));version=snap['version']
 artifact=ROOT/'artifacts/six_exercises_20261117/releases'/version
 manifest=json.loads((artifact/'manifest.json').read_text(encoding='utf-8'))
 cypher=artifact/'smartgym_six_kb.cypher'
 vectors=json.loads((index/'embeddings.json').read_text(encoding='utf-8'))
 assert manifest['kb_version']==version and manifest['import_verified']
 assert manifest['cypher_sha256']==hashlib.sha256(cypher.read_bytes()).hexdigest()
 assert manifest['snapshot_sha256']==hashlib.sha256((index/'snapshot.json').read_bytes()).hexdigest()
 assert vectors['kb_version']==version and set(vectors['vectors'])=={c['chunk_id'] for c in snap['chunks']}
 audit=json.loads((artifact/'quality_audit.json').read_text(encoding='utf-8'));assert audit['all_mechanical_checks_pass']
 evaluation=None
 if a.evaluation_run:
  summary=json.loads((a.evaluation_run/'summary.json').read_text(encoding='utf-8'))
  rows=json.loads((a.evaluation_run/'results.json').read_text(encoding='utf-8'))
  corpus=json.loads((ROOT/'evaluation/six_exercises_20261117/cases.json').read_text(encoding='utf-8'))['cases']
  assert summary['health_before']['kb_version']==version and summary['same_runtime']
  assert {r['case']['id'] for r in rows}=={c['id'] for c in corpus}
  assert all(r.get('http_status')==200 for r in rows)
  evaluation={'run':str(a.evaluation_run),'n':len(rows),'runtime_revision':summary['health_before']['runtime_revision'],
              'scope':'Full live run completed; this is not automatic content-quality approval.'}
 if a.action=='activate':
  if not evaluation:raise ValueError('A complete real evaluation run is required before activation')
  if a.chat_model:assert a.chat_model==summary['health_before']['llm_model'],'Chosen model differs from completed evaluation'
  current_revision=hashlib.sha256(b''.join(p.read_bytes() for p in sorted((ROOT/'kb_service').glob('*.py')))).hexdigest()[:16]
  assert current_revision==summary['health_before']['runtime_revision'],'Current service code differs from completed full evaluation'
  config=dotenv_values(env_path)
  prior={'KB_INDEX_DIR':config.get('KB_INDEX_DIR') or './data/index','KB_GRAPH_BACKEND':config.get('KB_GRAPH_BACKEND') or 'local',
         'OLLAMA_CHAT_MODEL':config.get('OLLAMA_CHAT_MODEL') or 'qwen3:8b'}
  # Never copy the full .env to an artifact: it may contain credentials.
  if metadata.exists():prior=json.loads(metadata.read_text(encoding='utf-8'))['previous_config']
  set_key(str(env_path),'KB_INDEX_DIR','./data/releases/six_exercises_20261118_r3')
  set_key(str(env_path),'KB_GRAPH_BACKEND','neo4j')
  if a.chat_model:
   set_key(str(env_path),'OLLAMA_CHAT_MODEL',a.chat_model)
  data={'kb_version':version,'activated_at':datetime.now(timezone.utc).isoformat(),'previous_config':prior,
    'current_index':'./data/releases/six_exercises_20261118_r3','chat_model':a.chat_model or config.get('OLLAMA_CHAT_MODEL'),
    'evaluation':evaluation,'quality_status':'development_release; consult human-readable review report','restart_required':True}
  metadata.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'action':a.action,'kb_version':version,'validated':True,'restart_required':a.action=='activate','evaluation':evaluation},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
