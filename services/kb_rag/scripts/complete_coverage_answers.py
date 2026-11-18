"""Run synthesis on a subset after the separate 36-query retrieval audit."""
import json
import time
import httpx
from kb_service.config import ROOT
out=ROOT/'artifacts/coverage_audit'
rows=json.loads((out/'cases.json').read_text(encoding='utf-8'))
report=json.loads((out/'report.json').read_text(encoding='utf-8'))
selected={'sq_knee','pu_compare','jj_sync','rc_hips','an_roles','context_empty','context_followup','context_change','gap_calorie','gap_cause','out_gold'}
with httpx.Client(timeout=300) as client:
    for row in rows:
        if row['id'] not in selected:continue
        body={'message':row['question'],'conversation':next((c.get('history',[]) for c in json.loads((ROOT/'evaluation/conversational_coverage.json').read_text(encoding='utf-8')) if c['id']==row['id']),[])}
        start=time.perf_counter();response=client.post('http://127.0.0.1:8001/api/chatbot',json=body);response.raise_for_status();answer=response.json()
        row.update(input=body,output=answer,citation_ids_valid=set(answer['citations'])<={e['chunk_id'] for e in answer['evidence']},
            support_quotes_present=bool(answer['retrieval'].get('support_quotes')),answer_elapsed_seconds=round(time.perf_counter()-start,2))
        (out/'cases.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
        print(row['id'],answer['status'],len(answer['citations']),flush=True)
report['end_to_end_queries']=sum('output' in r for r in rows)
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
