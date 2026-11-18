"""Targeted real planner retest after broadening scope to scoring/progress."""
import json
from kb_service.config import ROOT,Settings
from kb_service.engine import Engine
from kb_service.knowledge import plan_question
engine=Engine(Settings.from_env());cases=json.loads((ROOT/'evaluation/conversational_coverage.json').read_text(encoding='utf-8'))
out=[]
for case in cases:
    if case['id'] not in ['gap_penalty','gap_history']:continue
    plan=plan_question(engine,case['question'])
    out.append({'id':case['id'],'question':case['question'],'expected':case['action'],'plan':plan.model_dump()})
    print(case['id'],plan.action,plan.clarification,flush=True)
(ROOT/'artifacts/coverage_audit/intent_retest.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
