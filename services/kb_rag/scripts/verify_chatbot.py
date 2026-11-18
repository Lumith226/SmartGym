"""Actual HTTP/Ollama answers; model records are explicitly replayed, not fresh inference."""
import json
import time
from pathlib import Path
import httpx
from kb_service.config import ROOT

OUT=ROOT/'artifacts/chatbot';OUT.mkdir(exist_ok=True)
records=[]
for name in ['squat','push_up','jump_jack','situp','fit3d_test_squat']:
    result=json.loads((ROOT/f'artifacts/v4_live/{name}.json').read_text(encoding='utf-8'))['output']['result']
    records.append({'observation_id':name,'source_id':result['source']['video_sha256'],'model_result':result,'simulated':True})
cases=[]
questions=[('qa_squat','Khi squat tôi nên giữ lưng và đầu gối thế nào?'),
           ('qa_pushup','Chống đẩy gối khác chống đẩy chuẩn ở điểm nào?'),
           ('qa_jack','Tay và chân phối hợp thế nào trong jumping jack?'),
           ('qa_crunch','Gập bụng ngược có cần nâng hông khỏi thảm không?'),
           ('qa_book','Cơ chủ vận, cơ đối kháng và cơ hiệp đồng là gì?'),
           ('out_of_scope','Giá vàng hôm nay là bao nhiêu?')]
inputs=[(name,{'message':q,'task':'knowledge'}) for name,q in questions]
inputs += [('score_no_policy',{'message':'Vì sao tôi bị trừ điểm?','task':'score','records':[records[0]]}),
           ('score_explicit_demo_policy',{'message':'Giải thích điểm trừ và tiêu chí tương ứng.','task':'score','records':[records[0]],
                'scoring_policy':'DEMO do nhóm tự đặt, chưa kiểm định chuyên môn','rules':[{'exercise_code':'SQUAT','label_key':'back_not_straight','points':5}]}),
           ('session_summary',{'message':'Tóm tắt điểm cần xem lại trong buổi tập của tôi.','task':'summary','records':records[:4]}),
           ('practice_repeated_squat',{'message':'Tôi nên tập lại kỹ thuật gì cho lỗi lặp lại?','task':'practice','records':[records[0],records[4]]})]
with httpx.Client(timeout=300) as client:
    for name,body in inputs:
        start=time.perf_counter();r=client.post('http://127.0.0.1:8001/api/chatbot',json=body);r.raise_for_status();out=r.json()
        available={e['chunk_id'] for e in out['evidence']}
        assert set(out['citations'])<=available
        assert all('['+c+']' in out['reply'] for c in out['citations'])
        if name=='score_no_policy':assert out['session']['penalty_total'] is None
        if name=='score_explicit_demo_policy':assert out['session']['penalty_total']==5
        if name=='out_of_scope':assert out['status']=='insufficient_evidence' and not out['citations']
        case={'case':name,'input':body,'output':out,'elapsed_seconds':round(time.perf_counter()-start,2)};cases.append(case)
        (OUT/(name+'.json')).write_text(json.dumps(case,ensure_ascii=False,indent=2),encoding='utf-8')
        print(name, out['status'],out['generation_mode'],flush=True)
(OUT/'live_cases.json').write_text(json.dumps({'scope':'Actual HTTP and Ollama; archived real model outputs are replayed and marked simulated. Not an independent quality benchmark.','cases':cases},ensure_ascii=False,indent=2),encoding='utf-8')
lines=['# Câu trả lời chatbot thực tế','', 'Các video lưu trước được phát lại (simulated=true); LLM và truy xuất chạy thật. Quy tắc điểm DEMO chưa kiểm định.','']
for c in cases:lines += ['## '+c['case'],'','**Input:** '+c['input']['message'],'','**Output:**',c['output']['reply'],'']
(OUT/'answers_for_review.md').write_text('\n'.join(lines),encoding='utf-8')
