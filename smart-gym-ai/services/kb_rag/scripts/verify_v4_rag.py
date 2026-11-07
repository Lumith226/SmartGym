"""Fresh video -> model HTTP API -> KB retrieval -> constrained Ollama selection."""
from pathlib import Path
from datetime import datetime,timezone
import json
import time
import httpx

ROOT=Path(__file__).resolve().parents[1]
WORKSPACE=ROOT.parents[2]
APP=WORKSPACE/'SmartGym-Model/smart_gym_test_rtmpose_v4'
OUT=ROOT/'artifacts/v4_live';OUT.mkdir(exist_ok=True)
cases=[('squat','squats/BACK_ROUNDING_00001672.mp4'),
       ('push_up','pushups/HIP_ALIGNMENT_00135411.mp4'),
       ('jump_jack','jumping_jacks/ARMS_INCOMPLETE_00001308.mp4'),
       ('situp','reverse_crunches/SHALLOW_RANGE_00022158.mp4')]
results=[]
with httpx.Client(timeout=240) as client:
    health=client.get('http://127.0.0.1:8001/api/health').json()
    assert health['ready']
    for exercise,relative in cases+[('squat',str(WORKSPACE/'fit3d_test/test/s02/videos/squat.mp4'))]:
        path=Path(relative) if Path(relative).is_absolute() else APP/'test_videos_benchmark'/relative
        case_id=exercise if not Path(relative).is_absolute() else 'fit3d_test_squat'
        print('Running '+case_id+' with real video...',flush=True)
        start=time.perf_counter()
        with path.open('rb') as stream:
            response=client.post('http://127.0.0.1:8001/api/analyze-video',
                data={'exercise':exercise,'include_coach':'true'},files={'file':(path.name,stream,'video/mp4')})
        response.raise_for_status();body=response.json();coach=body['coach'];model=body['result']
        allowed={e['chunk_id'] for e in coach.get('evidence',[])}
        assert coach['status']!='unavailable',coach
        assert coach['observation']['simulated'] is False
        assert coach['observation']['unit']=='video'
        assert coach['observation']['schema_version']==model['schema_version']
        assert all(cid in allowed and '['+cid+']' in coach['reply'] for cid in coach['citations'])
        if coach['graph_claims']:assert coach['citations']
        row={'case':case_id,'input':{'video':str(path),'exercise':exercise,'include_coach':True},'output':body,
            'checks':{'http_and_schema_passed':True,'citation_ids_passed':True,'physical_camera_used':False,
                'model_prediction_accuracy':'not measured','professional_review':'pending'},
            'elapsed_seconds':round(time.perf_counter()-start,2)}
        (OUT/(case_id+'.json')).write_text(json.dumps(row,ensure_ascii=False,indent=2),encoding='utf-8')
        summary={'case':case_id,'status':coach['status'],'generation_used':coach['generation_used'],
            'generation_mode':coach['generation_mode'],'model_labels':len(model['label_results']),
            'active_labels':coach['observation']['labels'],'criteria':len(coach['graph_claims']),
            'citations':len(coach['citations']),'elapsed_seconds':row['elapsed_seconds'],
            'warnings':coach['warnings']}
        results.append(summary);print(json.dumps(summary,ensure_ascii=False),flush=True)
report={'checked_at_utc':datetime.now(timezone.utc).isoformat(),'model_runtime':health['runtime'],
        'cases':results,'scope':'Five camera-free HTTP examples; not a model-accuracy or advice-quality benchmark.'}
(OUT/'summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
