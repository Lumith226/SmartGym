"""Đánh giá đủ tập nhãn trên TẤT CẢ video squat benchmark, không chọn một nhãn đại diện."""
import argparse
import csv
import json
from pathlib import Path
import numpy as np
from sklearn.metrics import precision_recall_fscore_support, f1_score
from onnx_gym_analyzer import ONNXGymAnalyzer
from rtmpose_tracker import RTMPoseTracker
from squat_schema import LABELS, RAW_LABELS, encode_labels, sha256, write_json
from video_tools import analyze_squat_video, ground_truth, preview_frame

APP=Path(__file__).resolve().parent


def evaluate_rows(rows):
    y=np.array([encode_labels(r['comparison']['ground_truth']) for r in rows])
    pred=np.array([encode_labels(r['comparison']['predicted']) for r in rows])
    p,r,f,s=precision_recall_fscore_support(y,pred,average=None,zero_division=0)
    return {'samples':len(rows),'exact_match':float((y==pred).all(1).mean()),
            'micro_f1':float(f1_score(y,pred,average='micro',zero_division=0)),
            'macro_f1':float(f.mean()),
            'macro_f1_definition':f'all_{len(LABELS)}_labels; labels_without_positive_ground_truth_get_zero_f1',
            'macro_f1_supported_labels':float(f[s>0].mean()) if (s>0).any() else 0.,
            'labels_with_positive_support':int((s>0).sum()),
            'quality_rejected':sum(x['comparison']['quality_rejected'] for x in rows),
            'per_label':{item[0]:{'name_vi':item[2],'raw_label':RAW_LABELS[i],
                                  'precision':float(p[i]),'recall':float(r[i]),'f1':float(f[i]),
                                  'support':int(s[i])} for i,item in enumerate(LABELS)}}


def main():
    global LABELS, RAW_LABELS, encode_labels
    parser=argparse.ArgumentParser()
    parser.add_argument('--exercise',choices=['squat','jumpjack','pushup','crunch'],default='squat')
    parser.add_argument('--device',choices=['cuda','cpu'],default='cuda')
    parser.add_argument('--folder',default=None)
    parser.add_argument('--output',default=None)
    args=parser.parse_args()
    import importlib
    schema=importlib.import_module(args.exercise+'_schema')
    LABELS,RAW_LABELS,encode_labels=schema.LABELS,schema.RAW_LABELS,schema.encode_labels
    args.folder=args.folder or str(APP/'test_videos_benchmark'/dict(squat='squats',jumpjack='jumping_jacks',pushup='pushups',crunch='reverse_crunches')[args.exercise])
    args.output=args.output or str(APP/f'logs/benchmark_{args.exercise}_v4.json')
    folder=Path(args.folder)
    if not folder.is_dir():raise ValueError('Không có thư mục benchmark: '+str(folder))
    videos=sorted(p for p in folder.rglob('*') if p.suffix.lower() in {'.mp4','.avi','.mov','.mkv'})
    if not videos:raise ValueError('Không có video benchmark')
    analyzer=ONNXGymAnalyzer(args.device)
    contract=analyzer.load_v4_contract(dict(squat='squat',jumpjack='jump_jack',pushup='push_up',crunch='situp')[args.exercise])
    tracker=RTMPoseTracker(device=args.device);rows=[];skipped=[];seen=set()
    for path in videos:
        digest=sha256(path)
        if digest in seen:continue
        seen.add(digest)
        reference=ground_truth(path,args.exercise)
        if reference is None or not reference.get('benchmark'):
            skipped.append({'file':path.name,'reason':'Không có nhãn benchmark khớp nội dung'});continue
        result,raw=analyze_squat_video(path,tracker,analyzer,cache_dir=APP/'logs/benchmark_pose_cache',exercise=args.exercise)
        from app import render_dashboard,draw_skeleton
        import cv2
        frame,kpts=preview_frame(path,result,raw);draw_skeleton(frame,kpts)
        image=render_dashboard(frame,result,source=path.name,view='Toàn video')
        preview_path=APP/('logs/benchmark_previews' if args.exercise=='squat' else 'logs/benchmark_previews_'+args.exercise)/(path.stem+'.png')
        preview_path.parent.mkdir(parents=True,exist_ok=True)
        cv2.imencode('.png',image)[1].tofile(str(preview_path))
        result['preview_file']=str(preview_path.relative_to(APP))
        result['video']=path.name;rows.append(result)
        cmp=result['comparison']
        print(path.name,'exact=',cmp['exact_match'],'missed=',len(cmp['missed']),'extra=',len(cmp['extra']),flush=True)
    if not rows:raise ValueError('Không có video benchmark với nhãn đã xác thực')
    report={'schema_version':contract['schema_version'],
            'onnx_sha256':contract['onnx_sha256'],
            'threshold_source':'validation_only; benchmark never tunes thresholds',
            'metrics':evaluate_rows(rows),'videos':rows,'skipped':skipped}
    write_json(args.output,report)
    csv_path=Path(args.output).with_suffix('.csv')
    with csv_path.open('w',newline='',encoding='utf-8-sig') as f:
        writer=csv.writer(f);writer.writerow(['Video','Nhãn gốc','Dự đoán','Bỏ sót','Báo thừa','Khớp toàn bộ'])
        for row in rows:
            c=row['comparison']
            writer.writerow([row['video'],'; '.join(c['ground_truth']),'; '.join(c['predicted']),
                             '; '.join(c['missed']),'; '.join(c['extra']),c['exact_match']])
    print(json.dumps(report['metrics'],ensure_ascii=False,indent=2),flush=True)
    print('REPORT',args.output,flush=True)


if __name__=='__main__':main()
