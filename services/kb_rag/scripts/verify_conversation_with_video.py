"""Actual new CPU video inference passed to the open-ended knowledge chat."""
import json
import httpx
from kb_service.config import ROOT
video=ROOT.parents[2]/'SmartGym-Model/smart_gym_test_rtmpose_v4/test_videos_benchmark/squats/BACK_ROUNDING_00001672.mp4'
with httpx.Client(timeout=300) as client:
    with video.open('rb') as stream:
        r=client.post('http://127.0.0.1:8001/api/analyze-video',data={'exercise':'squat','include_coach':'false'},files={'file':(video.name,stream,'video/mp4')})
    r.raise_for_status();result=r.json()['result']
    body={'task':'knowledge','message':'Trong kết quả video buổi này, model báo lỗi gì và tôi nên lưu ý kỹ thuật gì?',
          'records':[{'observation_id':'fresh_squat','source_id':result['source']['video_sha256'],'model_result':result,'simulated':False}]}
    r=client.post('http://127.0.0.1:8001/api/chatbot',json=body);r.raise_for_status();answer=r.json()
    (ROOT/'artifacts/coverage_audit/fresh_video_conversation.json').write_text(json.dumps({'input':body,'output':answer},ensure_ascii=False,indent=2),encoding='utf-8')
    assert answer['session']['observations'][0]['exercise_code']=='SQUAT'
    assert answer['session']['observations'][0]['simulated'] is False
    assert answer['generation_mode']=='grounded_synthesis',answer['reply']
    assert answer['citations']
    (ROOT/'artifacts/coverage_audit/fresh_video_conversation.json').write_text(json.dumps({'passed':True,'physical_camera_used':False,'input':body,'output':answer},ensure_ascii=False,indent=2),encoding='utf-8')
    print(answer['status'],answer['reply'],flush=True)
