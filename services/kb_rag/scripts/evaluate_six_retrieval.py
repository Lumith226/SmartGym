"""Chunk-level developer annotations; controlled retrieval/source ablations."""
from pathlib import Path
from dataclasses import replace
import argparse,json,sys,tempfile,os,hashlib
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from kb_service.config import Settings
from kb_service.models import QueryRequest
from kb_service.retrieval import Retriever
from kb_service.ingest import write_json
from kb_service.text import expand_query,EXERCISES
from kb_service.providers import OllamaEmbedder

ANNOTATIONS={
 'SQUAT_K01':[('ace_squat','Step 1')], 'SQUAT_K02':[('ace_squat','Step 3')],
 'SQUAT_K03':[('ace_squat','Step 6')], 'SQUAT_K07':[('nsca_movement_progressions','Figure 1 — Squat exercise progression')],
 'PUSHUP_K01':[('ace_pushup','Step 2')], 'PUSHUP_K02':[('ace_pushup','Step 3')],
 'PUSHUP_K03':[('ace_pushup','Step 3'),('ace_pushup','Step 4')], 'PUSHUP_K05':[('nsca_movement_progressions','Figure 3 — Horizontal push exercise progression')],
 'JUMPING_JACK_K01':[('nasm_jumping_jacks','Step 1: Setup')],
 'JUMPING_JACK_K02':[('nasm_jumping_jacks','Step 3: Execute/Drive'),('nasm_jumping_jacks','Step 4: Return/Descent')],
 'JUMPING_JACK_K03':[('nasm_jumping_jacks','Step 3: Execute/Drive')],
 'JUMPING_JACK_K07':[('nasm_jumping_jacks','How many jumping jacks should be performed for cardiovascular benefits?')],
 'REVERSE_CRUNCH_K01':[('ace_reverse_crunch','Step 1')], 'REVERSE_CRUNCH_K02':[('ace_reverse_crunch','Step 2')],
 'REVERSE_CRUNCH_K03':[('ace_reverse_crunch','Step 3')], 'REVERSE_CRUNCH_K04':[('ace_reverse_crunch','Step 2')],
 'HIGH_KNEES_K01':[('ohio_movement_library','High Knees')], 'HIGH_KNEES_K02':[('ohio_movement_library','High Knees')],
 'HIGH_KNEES_K03':[('ohio_movement_library','High Knees')],
 'HIGH_KNEES_K07':[('cdc_intensity','How to Measure Physical Activity Intensity','Talk Test.')],
 'BUTT_KICKERS_K01':[('ohio_movement_library','Butt Kickers')], 'BUTT_KICKERS_K02':[('ohio_movement_library','Butt Kickers')],
 'BUTT_KICKERS_K03':[('ohio_movement_library','Butt Kickers')],
 'BUTT_KICKERS_K08':[('smartgym_model_protocol','SmartGym V4 — Ý nghĩa nhãn, phạm vi quan sát và quy ước đếm')],
}
for code in ['SQUAT','PUSHUP','JUMPING_JACK','REVERSE_CRUNCH','HIGH_KNEES','BUTT_KICKERS']:
 ANNOTATIONS[code+'_WARMUP']=[('hhs_physical_activity_2018','Chapter 4 — Active Adults, ages 18–64','Warm-up and cool-down activities')]

def main():
 p=argparse.ArgumentParser();p.add_argument('--build-only',action='store_true');a=p.parse_args()
 s=Settings.from_env();snap=json.loads((s.index_dir/'snapshot.json').read_text(encoding='utf-8'))
 cases=json.loads((ROOT/'evaluation/six_exercises_20261117/cases.json').read_text(encoding='utf-8'))['cases'];by_id={c['id']:c for c in cases}
 gold=[]
 for key,descriptors in ANNOTATIONS.items():
  ids=[]
  for item in descriptors:
   matches=[c['chunk_id'] for c in snap['chunks'] if c['source_id']==item[0] and c['section']==item[1] and (len(item)<3 or item[2] in c['text'])]
   if not matches:raise ValueError('No exact annotated passage: '+repr(item))
   ids.extend(matches)
  gold.append({'id':key,'question':by_id[key]['message'],'exercise_code':by_id[key]['exercise'],'relevant_chunk_ids':list(dict.fromkeys(ids)),
   'annotation_basis':'Developer inspected source section and selected a directly supporting passage; not independently exhaustive relevance judgments.'})
 out=ROOT/'artifacts/six_exercises_20261117/releases'/snap['version'];out.mkdir(parents=True,exist_ok=True)
 write_json(out/'retrieval_gold.json',{'kb_version':snap['version'],'annotator':'Codex development audit; independent domain review pending','cases':gold})
 if a.build_only:print(json.dumps({'annotated_questions':len(gold)}));return
 # All conditions use identical queries, top_k, model and a local copy of the
 # graph. Do not mix live Neo4j with partially removed synthetic namespaces.
 os.environ['KB_GRAPH_BACKEND']='local'
 vectors=json.loads((s.index_dir/'embeddings.json').read_text(encoding='utf-8'))
 queries=[expand_query(case['question'])+'  '+' '.join(EXERCISES[case['exercise_code']][:2]) for case in gold]
 query_cache={}
 for start in range(0,len(queries),8):
  batch=queries[start:start+8]
  query_cache.update(zip(batch,OllamaEmbedder(s).embed(batch,query=True)))
 write_json(out/'retrieval_query_vectors.json',{'model':s.embed_model,'vectors':query_cache,'purpose':'Evaluation-only query cache; actual Ollama embeddings, not answer templates.'})
 def cached_embed(self,texts,query=False):
  if not query or any(text not in query_cache for text in texts):raise ValueError('Unexpected retrieval evaluation query')
  return [query_cache[text] for text in texts]
 summaries=[];details=[]
 variants=[('FULL',set(c['source_id'] for c in snap['chunks']),['lexical','dense','graph','hybrid']),
  ('KB1_ACE',{'ace_squat','ace_pushup','ace_reverse_crunch','ace_knee_pushup'},['hybrid']),
  ('KB1_PLUS_KB2_ACE_NASM_OHIO',{'ace_squat','ace_pushup','ace_reverse_crunch','ace_knee_pushup','nasm_jumping_jacks','ohio_movement_library'},['hybrid'])]
 with tempfile.TemporaryDirectory(prefix='smartgym_retrieval_') as tmp,patch('kb_service.retrieval.OllamaEmbedder.embed',cached_embed):
  for variant,source_ids,modes in variants:
   path=Path(tmp)/variant
   subset={**snap,'chunks':[c for c in snap['chunks'] if c['source_id'] in source_ids],
                'claims':[c for c in snap['claims'] if c['source_id'] in source_ids]}
   write_json(path/'snapshot.json',subset)
   chunk_ids={c['chunk_id'] for c in subset['chunks']}
   write_json(path/'embeddings.json',{**vectors,'vectors':{k:v for k,v in vectors['vectors'].items() if k in chunk_ids}})
   retriever=Retriever(replace(s,index_dir=path))
   for mode in modes:
    rows=[]
    for case in gold:
     e,_,trace=retriever.search(QueryRequest(message=case['question'],exercise_code=case['exercise_code'],top_k=5),mode=mode,semantic_scope=True)
     ranked=[x.chunk_id for x in e];expected=set(case['relevant_chunk_ids']);hits=expected.intersection(ranked)
     recall=len(hits)/len(expected);rr=next((1/i for i,cid in enumerate(ranked,1) if cid in expected),0)
     rows.append({'id':case['id'],'variant':variant,'mode':mode,'gold':sorted(expected),'ranked':ranked,'recall_at_5':recall,'reciprocal_rank_at_5':rr,
                  'eligible_gold_fraction':len(expected.intersection(chunk_ids))/len(expected),'dense_status':trace['dense_status']})
    result={'variant':variant,'mode':mode,'n':len(rows),'chunk_recall_at_5':sum(x['recall_at_5'] for x in rows)/len(rows),
            'chunk_mrr_at_5':sum(x['reciprocal_rank_at_5'] for x in rows)/len(rows)}
    summaries.append(result);details.extend(rows);print(json.dumps(result),flush=True)
 write_json(out/'retrieval_evaluation.json',{'kb_version':snap['version'],'top_k':5,'level':'annotated_chunk','n':len(gold),'summaries':summaries,'details':details,
  'limits':['Developer-authored relevance set; no independent expert or blind holdout.',
   'Six warm-up phrasings use the same general HHS passage; questions are not statistically independent.',
   'Retrieval metrics do not measure factual answer accuracy or LLM naturalness.',
   'Source ablations use identical original questions and cached full-corpus document vectors; no generator changes.']})

if __name__=='__main__':main()
