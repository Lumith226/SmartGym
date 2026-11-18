"""Targeted retest of all declared knowledge/data gaps after adding capability checks."""
import json
import httpx
from kb_service.config import ROOT
out=ROOT/'artifacts/coverage_audit';rows=json.loads((out/'cases.json').read_text(encoding='utf-8'));report=json.loads((out/'report.json').read_text(encoding='utf-8'))
with httpx.Client(timeout=240) as client:
    for row in rows:
        if row['group']!='knowledge_gap':continue
        body={'message':row['question']};r=client.post('http://127.0.0.1:8001/api/chatbot',json=body);r.raise_for_status();answer=r.json()
        row['previous_plan']=row['plan'];row['plan']=answer['retrieval']['planner']
        if row['expected_action']:row['action_correct']=row['plan']['action']==row['expected_action']
        row.update(input=body,output=answer,citation_ids_valid=set(answer['citations'])<={e['chunk_id'] for e in answer['evidence']},support_quotes_present=bool(answer['retrieval'].get('support_quotes')))
        print(row['id'],answer['status'],answer['generation_mode'],flush=True)
report['action_cases']=[{'id':r['id'],'expected':r['expected_action'],'actual':r['plan']['action'],'correct':r['action_correct']} for r in rows if r['expected_action']]
report['end_to_end_queries']=sum('output' in r for r in rows)
report['retest_note']='Targeted retest of six gap cases after explicitly registering missing capabilities. Prior plans preserved. No expected answer text is supplied to the chatbot.'
(out/'cases.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
