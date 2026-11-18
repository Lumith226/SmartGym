"""HTTP checks for abstention, missing KB links and replayed real observations."""
from pathlib import Path
from copy import deepcopy
import json
import httpx

ROOT=Path(__file__).resolve().parents[1]
workspace=ROOT.parents[2]
base=json.loads((ROOT/'artifacts/v4_live/push_up.json').read_text(encoding='utf-8'))['output']['result']
cases=[]
with httpx.Client(timeout=30) as client:
    unknown=deepcopy(base)
    for row in unknown['label_results']:
        row['probability']=1.0 if row['key']=='child_pose_cheat' else 0.0
    request={'message':'Giải thích nhãn và tiêu chí kỹ thuật.','model_result':unknown,'simulated':True,'generate':True}
    response=client.post('http://127.0.0.1:8010/v1/chat/from-model',json=request)
    response.raise_for_status();output=response.json()
    assert output['status']=='insufficient_evidence' and not output['generation_used'] and not output['citations']
    cases.append({'case':'uncovered_error','input_is_simulated':True,'output':output,'passed':True})
    weak=deepcopy(base);weak['quality']['usable']=False
    request['model_result']=weak
    response=client.post('http://127.0.0.1:8010/v1/chat/from-model',json=request)
    response.raise_for_status();output=response.json()
    assert output['status']=='insufficient_observation' and not output['evidence']
    cases.append({'case':'insufficient_observation','input_is_simulated':True,'output':output,'passed':True})
    replay=json.loads((workspace/'SmartGym-Model/.runtime/checks/crunch_video_result.json').read_text(encoding='utf-8'))
    request.update(model_result=replay,simulated=False,generate=False)
    response=client.post('http://127.0.0.1:8010/v1/chat/from-model',json=request)
    response.raise_for_status();output=response.json()
    assert 'not_raising_hips' not in output['observation']['labels']
    assert not output['graph_claims'] and output['knowledge_coverage']['detected_error_labels']==0
    cases.append({'case':'recorded_real_inference_with_missed_label','input_is_simulated':False,
                  'fresh_inference':False,'ground_truth_not_used_as_model_observation':True,'output':output,'passed':True})
    bad=deepcopy(base);bad['model_provenance']['model_sha256']='0'*64
    request.update(model_result=bad,simulated=True)
    response=client.post('http://127.0.0.1:8010/v1/chat/from-model',json=request)
    assert response.status_code==422
    cases.append({'case':'mismatched_model_hash','input_is_simulated':True,'status_code':422,'passed':True})
(ROOT/'artifacts/v4_behavior_checks.json').write_text(json.dumps({'scope':'Behavior checks, not an accuracy benchmark.','cases':cases},ensure_ascii=False,indent=2),encoding='utf-8')
print([{'case':c['case'],'passed':c['passed']} for c in cases])
