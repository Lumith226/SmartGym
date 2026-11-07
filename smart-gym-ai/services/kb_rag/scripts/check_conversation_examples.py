import json
from kb_service.config import ROOT
import httpx
cases=json.loads((ROOT/'evaluation/conversational_coverage.json').read_text(encoding='utf-8'))
out=[]
with httpx.Client(timeout=300) as client:
    for case in [c for c in cases if c['id'] in ['context_empty','pu_compare','pu_sag','sq_knee']]:
        r=client.post('http://127.0.0.1:8001/api/chatbot',json={'message':case['question']});r.raise_for_status();body=r.json()
        out.append({'case':case['id'],'input':case['question'],'output':body})
        print(case['id'],body['status'],body['reply'],flush=True)
(ROOT/'artifacts/coverage_audit/preflight_8b.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
