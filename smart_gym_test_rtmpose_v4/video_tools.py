"""Cùng đường suy luận cho CLI, giao diện và benchmark squat V4."""
from functools import lru_cache
import json
from pathlib import Path
import numpy as np
import cv2
from squat_schema import sample_video, sha256, RAW_LABELS, write_json, SCHEMA_VERSION, angle

APP = Path(__file__).resolve().parent


@lru_cache(maxsize=2)
def references(exercise='squat'):
    path = APP/f'weights/{exercise}_label_reference.json'
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}


def ground_truth(path, exercise='squat'):
    """Chỉ gắn nhãn gốc khi NỘI DUNG video khớp; tên file không đủ bằng chứng."""
    return references(exercise).get(sha256(path))


def compare_labels(result, reference):
    if reference is None: return None
    gt = set(reference['raw_labels'])
    pred = {r['raw_label'] for r in result.get('detected_labels',[])}
    return {'ground_truth':sorted(gt),'predicted':sorted(pred),'matched':sorted(gt & pred),
            'missed':sorted(gt-pred),'extra':sorted(pred-gt),'exact_match':gt==pred,
            'benchmark':reference.get('benchmark',False),
            'quality_rejected':result.get('status')=='insufficient_data'}


def analyze_squat_video(path, pose_tracker, analyzer, cache_dir=None, exercise='squat'):
    path = Path(path)
    import importlib
    schema = importlib.import_module(exercise+'_schema')
    fingerprint = sha256(path)+':'+schema.SCHEMA_VERSION
    cached = Path(cache_dir)/(fingerprint.split(':')[0]+'_'+exercise+'.npz') if cache_dir else None
    raw, info = None, None
    if cached and cached.exists():
        with np.load(cached) as data:
            if str(data['fingerprint'])==fingerprint:
                raw=data['raw'];info=json.loads(str(data['info']))
    if raw is None:
        frames,info=schema.sample_video(path)
        pose_tracker.reset()
        raw=np.array(pose_tracker.process_clip(frames),dtype=np.float32)
        if cached:
            cached.parent.mkdir(parents=True,exist_ok=True)
            np.savez_compressed(cached,raw=raw,info=json.dumps(info),fingerprint=fingerprint)
    predict=getattr(analyzer,'predict_'+exercise+'_sequence')
    result=predict(raw,info['duration_seconds'],scope='video')
    result['source']={'file':path.name,**info}
    xy=raw[:,:2].transpose(0,2,1)
    angles=np.full((len(raw),2),np.nan)
    triples={'pushup':[(5,7,9),(6,8,10)],'crunch':[(5,11,13),(6,12,14)]}.get(exercise,[(11,13,15),(12,14,16)])
    for side,(hip,knee,ankle) in enumerate(triples):
        valid=(raw[:,2,[hip,knee,ankle]]>=.2).all(1)
        angles[valid,side]=angle(xy[valid,hip],xy[valid,knee],xy[valid,ankle])
    valid_counts=np.isfinite(angles).sum(1)
    scores=np.nansum(angles,axis=1)/np.maximum(valid_counts,1)
    scores[valid_counts==0]=np.inf
    preview=int(np.argmin(scores)) if np.isfinite(scores).any() else len(raw)//2
    if exercise=='jumpjack':
        valid=(raw[:,2,[5,6,9,10]]>=.2).all(1)
        elevation=(raw[:,1,5]+raw[:,1,6]-raw[:,1,9]-raw[:,1,10])/2
        elevation[~valid]=-np.inf
        preview=int(np.argmax(elevation)) if valid.any() else len(raw)//2
    result['source']['preview_sample_index']=preview
    result['source']['preview_frame_index']=int(round(info['sample_times'][preview]*info['fps']))
    result['comparison']=compare_labels(result,ground_truth(path,exercise))
    return result,raw


def preview_frame(path,result,raw):
    cap=cv2.VideoCapture(str(path))
    try:
        cap.set(cv2.CAP_PROP_POS_FRAMES,result['source']['preview_frame_index'])
        ok,frame=cap.read()
        if not ok:raise ValueError('Không đọc được frame minh họa')
        keypoints=raw[result['source']['preview_sample_index']].copy()
        keypoints[0]*=frame.shape[0]/frame.shape[1]
        return frame,keypoints
    finally:cap.release()


def print_result(result):
    print('\n'+result['class_name_vi'])
    print('Nhãn | Điểm mô hình | Ngưỡng | Kết quả | Nhãn gốc')
    comparison=result.get('comparison');gt=set(comparison['ground_truth']) if comparison else None
    for row in result.get('label_results',[]):
        probability=row['probability'];threshold=row['threshold']
        score=f'{probability*100:.1f}%' if probability is not None else '--'
        cutoff=f'{threshold*100:.1f}%' if threshold is not None else '--'
        truth='Có' if gt is not None and row['raw_label'] in gt else ('Không ghi' if gt is not None else '--')
        print(f"{row['name_vi']} | {score} | {cutoff} | {row['status']} | {truth}")
    if comparison:
        print('BỎ SÓT:',comparison['missed'])
        print('BÁO THỪA:',comparison['extra'])
        print('KHỚP TOÀN BỘ:',comparison['exact_match'])
    print('Chất lượng pose:',result.get('quality'))
