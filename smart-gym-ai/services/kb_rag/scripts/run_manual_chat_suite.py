"""Execute the user's Markdown scenarios, not a KB/prompt training corpus.

All HTTP responses and failed attempts are retained. Grades are reviewed later;
a 200 status or the LLM's own supported flag is never an accuracy grade.
"""
import argparse,json,re,time,hashlib
from pathlib import Path
from datetime import datetime,timezone
import httpx

ROOT=Path(__file__).resolve().parents[1];WORKSPACE=ROOT.parents[2]
PLAN=WORKSPACE/'BO_KICH_BAN_TEST_CHATBOT_THU_CONG.md'
parser=argparse.ArgumentParser();parser.add_argument('--only',nargs='*');parser.add_argument('--out-dir',default='artifacts/manual_suite_20261107');args=parser.parse_args()
OUT=ROOT/args.out_dir;OUT.mkdir(parents=True,exist_ok=True)
source=PLAN.read_text(encoding='utf-8')
rows=[]
for line in source.splitlines():
    if re.match(r'^\| (XG|KT|HT|MT|VD|DI|BT|GH|TC)\d\d \|',line):
        cells=[v.strip() for v in line.strip('|').split('|')]
        case_id,setup,expected=cells
        quotes=re.findall('“([^”]+)”',setup)
        question=quotes[0] if quotes else setup
        rows.append({'id':case_id,'setup':setup,'message':question,'expected':expected})
assert len(rows)==40 and len({r['id'] for r in rows})==40
manifest={'source':str(PLAN),'sha256':hashlib.sha256(PLAN.read_bytes()).hexdigest(),'cases':rows}
(OUT/'scenario_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')

def record(key):
    result=json.loads((OUT/f'video_{key}.json').read_text(encoding='utf-8'))['result']
    return {'observation_id':'manual_'+key,'source_id':result['source']['video_sha256'],
            'model_result':result,'simulated':key=='insufficient'}
records={key:record(key) for key in ['squat','squat_second','push_up','jump_jack','situp','insufficient']}
store=OUT/'results.json'
results=json.loads(store.read_text(encoding='utf-8')) if store.exists() else []
run_id=datetime.now(timezone.utc).isoformat()
history=[];last_pdf=[]

def history_add(question,output):
    history.extend([{'role':'user','content':question},{'role':'assistant','content':output.get('reply','')[:3000]}])

def ask(case,message=None,attached=None,task='knowledge',rules=None,conversation=None,suffix=''):
    key=case['id']+suffix
    body={'message':message or case['message'],'task':task,'records':attached or [],'generate':True,
          'conversation':(history if conversation is None else conversation)[-6:]}
    if case['id'] in ['VD01','VD02']:
        body['video_context']={'state':'selected' if case['id']=='VD01' else 'analyzed','source_id':records['squat']['source_id'] if case['id']=='VD02' else None}
    if rules:body.update(scoring_policy='DEMO kiểm thử thủ công — chưa kiểm định',rules=rules)
    item={'case_id':key,'parent_id':case['id'],'run_id':run_id,'expected':case['expected'],
          'runtime_revision':health.get('runtime_revision'),
          'setup':case['setup'],'input':body,'timestamp_utc':datetime.now(timezone.utc).isoformat(),
          'review_status':'Chờ rà soát','test_path':'actual HTTP web API -> KB service; fresh DL outputs attached where required'}
    start=time.perf_counter()
    try:
        response=client.post('http://127.0.0.1:8001/api/chatbot',json=body)
        item['http_status']=response.status_code
        item['output']=response.json()
    except Exception as e:item['error']=str(e)
    item['seconds']=round(time.perf_counter()-start,3)
    results.append(item);store.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    output=item.get('output',{})
    print(json.dumps({'id':key,'seconds':item['seconds'],'status':output.get('status'),'mode':output.get('generation_mode'),'reply':output.get('reply'), 'error':item.get('error')},ensure_ascii=False),flush=True)
    return output

with httpx.Client(timeout=360) as client:
    health=client.get('http://127.0.0.1:8010/health').json()
    (OUT/f'runtime_{run_id.replace(":","-")}.json').write_text(json.dumps(health,ensure_ascii=False,indent=2),encoding='utf-8')
    for case in rows:
        cid=case['id']
        if args.only and cid not in args.only:continue
        if cid.startswith('KT') or cid.startswith('MT') or cid.startswith('VD') or cid.startswith('DI') or cid.startswith('BT') or cid.startswith('GH'):history=[]
        if cid in ['XG01','HT01']:history=[]
        if cid.startswith(('XG','HT')):
            output=ask(case);history_add(case['message'],output)
        elif cid.startswith('KT'):
            output=ask(case)
            if cid=='KT05':last_pdf=[{'role':'user','content':case['message']},{'role':'assistant','content':output.get('reply','')[:3000]}]
        elif cid=='MT03':
            output=ask(case);history_add(case['message'],output)
            ask(case,'Tôi kéo gối và cuộn hông lên khỏi thảm.',suffix='_followup')
        elif cid.startswith('MT'):ask(case)
        elif cid in ['VD01','VD02']:ask(case)
        elif cid=='VD03':ask(case,attached=[records['squat']])
        elif cid=='VD04':
            for key in ['push_up','jump_jack','situp']:ask(case,attached=[records[key]],suffix='_'+key)
        elif cid=='VD05':ask(case,attached=[records['squat'],records['push_up']])
        elif cid=='VD06':ask(case,attached=[records['insufficient']])
        elif cid=='DI01':ask(case,attached=[records['squat']],task='score')
        elif cid=='DI02':ask(case,attached=[records['squat']],task='score',rules=[{'exercise_code':'SQUAT','label_key':'back_not_straight','points':7}])
        elif cid=='DI03':
            ask(case,attached=[records['squat']],task='score')
            ask(case,attached=[records['squat']],suffix='_knowledge')
        elif cid=='BT01':ask(case,task='summary')
        elif cid=='BT02':ask(case,attached=[records['squat'],records['push_up']],task='summary')
        elif cid=='BT03':
            duplicate={**records['squat'],'observation_id':'duplicate_same_video'}
            ask(case,attached=[records['squat'],duplicate],task='practice')
        elif cid=='BT04':ask(case,attached=[records['squat'],records['squat_second']],task='practice')
        elif cid.startswith('GH'):ask(case)
        elif cid=='TC01':
            if not last_pdf:
                old=next((r for r in reversed(results) if r['case_id']=='KT05' and r.get('output',{}).get('citations')),None)
                if old:last_pdf=[{'role':'user','content':old['input']['message']},{'role':'assistant','content':old['output']['reply'][:3000]}]
            history=last_pdf.copy();output=ask(case);history_add(case['message'],output)
        elif cid=='TC02':
            output=ask(case);history_add(case['message'],output)
        else:history=[];ask(case)
    ending=client.get('http://127.0.0.1:8010/health').json()
    assert ending.get('runtime_revision')==health.get('runtime_revision'),'KB runtime changed during test run'
    (OUT/f'run_complete_{run_id.replace(":","-")}.json').write_text(json.dumps({'run_id':run_id,'runtime_before':health,'runtime_after':ending,'complete':True,'only':args.only},ensure_ascii=False,indent=2),encoding='utf-8')
print('Completed requested scenarios; responses await external review.',flush=True)
