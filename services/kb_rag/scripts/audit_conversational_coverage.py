"""Developer-authored paraphrase audit, not a training set or independent benchmark."""
import json
from collections import Counter,defaultdict
import time
import argparse
import httpx
from kb_service.config import ROOT,Settings
from kb_service.engine import Engine
from kb_service.models import QueryRequest
from kb_service.knowledge import plan_question
from kb_service.v4 import coverage_report

parser=argparse.ArgumentParser();parser.add_argument('--retrieval-only',action='store_true');args=parser.parse_args()
out=ROOT/'artifacts/coverage_audit';out.mkdir(exist_ok=True)
engine=Engine(Settings.from_env());cases=json.loads((ROOT/'evaluation/conversational_coverage.json').read_text(encoding='utf-8'))
results=[]
with httpx.Client(timeout=300) as client:
    for case in cases:
        start=time.perf_counter();history=case.get('history',[])
        plan=plan_question(engine,case['question'],history)
        old,_,old_trace=engine.retriever.search(QueryRequest(message=case['question'],top_k=5))
        evidence=[];trace={};claims=[]
        if plan.action=='retrieve':
            evidence,claims,trace=engine.retriever.search(QueryRequest(message=plan.search_query or case['question'],exercise_code=None if plan.exercise=='ANY' else plan.exercise,top_k=10),semantic_scope=True)
        expected=set(case.get('sources',[]));new_sources={e.source_id for e in evidence[:5]};old_sources={e.source_id for e in old}
        row={'id':case['id'],'group':case['group'],'question':case['question'],'plan':plan.model_dump(),
             'expected_sources':sorted(expected),'retrieved_sources_at_5':sorted(new_sources),'retrieved_chunk_ids':[e.chunk_id for e in evidence],
             'baseline_gate_reason':old_trace.get('reason'),'baseline_source_recall_at_5':len(expected & old_sources)/len(expected) if expected else None,
             'source_recall_at_5':len(expected & new_sources)/len(expected) if expected else None,
             'expected_action':case.get('action'),'action_correct':plan.action==case['action'] if 'action' in case else None,
             'knowledge_gap':case.get('gap'),'retrieval':trace}
        if case.get('e2e') and not args.retrieval_only:
            body={'message':case['question'],'conversation':history}
            r=client.post('http://127.0.0.1:8001/api/chatbot',json=body);r.raise_for_status();answer=r.json()
            row['input']=body;row['output']=answer
            row['citation_ids_valid']=set(answer['citations'])<={e['chunk_id'] for e in answer['evidence']}
            row['support_quotes_present']=bool(answer['retrieval'].get('support_quotes'))
        row['elapsed_seconds']=round(time.perf_counter()-start,2);results.append(row)
        (out/'cases.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
        print(case['id'],plan.action,row['source_recall_at_5'],row.get('output',{}).get('status','retrieval_only'),flush=True)
snap=engine.retriever.snapshot;positive=[r for r in results if r['source_recall_at_5'] is not None]
groups={}
for name in sorted({r['group'] for r in positive}):
    rows=[r for r in positive if r['group']==name]
    groups[name]={'queries':len(rows),'baseline_source_recall_at_5':sum(r['baseline_source_recall_at_5'] for r in rows)/len(rows),
                  'semantic_source_recall_at_5':sum(r['source_recall_at_5'] for r in rows)/len(rows)}
report={'scope':'36 developer-authored paraphrase/context/gap cases. Source recall is a retrieval proxy, not answer accuracy, completeness or population coverage.',
        'kb_version':snap['version'],'llm_model':engine.settings.chat_model,'sources':len(snap['sources']),'chunks':len(snap['chunks']),
        'chunk_distribution':dict(Counter(c['source_id'] for c in snap['chunks'])),'model_label_coverage':coverage_report(snap),
        'case_count':len(results),'positive_retrieval_queries':len(positive),'end_to_end_queries':sum('output' in r for r in results),
        'baseline_mean_source_recall_at_5':sum(r['baseline_source_recall_at_5'] for r in positive)/len(positive),
        'semantic_mean_source_recall_at_5':sum(r['source_recall_at_5'] for r in positive)/len(positive),'groups':groups,
        'action_cases':[{'id':r['id'],'expected':r['expected_action'],'actual':r['plan']['action'],'correct':r['action_correct']} for r in results if r['expected_action']],
        'open_gaps':[{'id':r['id'],'gap':r['knowledge_gap']} for r in results if r['knowledge_gap']]}
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('Saved',out/'report.json')
