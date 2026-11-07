"""Fresh inference for manual-suite contexts; labels are never overwritten."""
from pathlib import Path
import json,time,hashlib,argparse
import httpx
import cv2
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
WORKSPACE=ROOT.parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--out-dir',default='artifacts/manual_suite_20261107');parser.add_argument('--usable',action='store_true');args=parser.parse_args()
OUT=ROOT/args.out_dir
OUT.mkdir(parents=True,exist_ok=True)
VIDEOS=WORKSPACE/'SmartGym-Model/smart_gym_test_rtmpose_v4/test_videos_benchmark'
choices=[('squat','squats','BACK_ROUNDING_00001672.mp4'),
         ('squat_second','squats','BACK_ROUNDING_00058216.mp4'),
         ('push_up','pushups',None),('jump_jack','jumping_jacks',None),('situp','reverse_crunches',None)]
if args.usable:
    choices=[(key,folder,{'push_up':'CORRECT_00102902.mp4','situp':'CORRECT_00085688.mp4'}.get(key,name)) for key,folder,name in choices]
manifest=[]
with httpx.Client(timeout=600) as client:
    for key,folder,name in choices:
        path=VIDEOS/folder/name if name else next(iter(sorted((VIDEOS/folder).glob('*.mp4'))))
        started=time.perf_counter()
        with path.open('rb') as stream:
            r=client.post('http://127.0.0.1:8001/api/analyze-video',data={'exercise':'squat' if key=='squat_second' else key,'include_coach':'false'},files={'file':(path.name,stream,'video/mp4')})
        r.raise_for_status();output=r.json()
        (OUT/f'video_{key}.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
        manifest.append({'key':key,'video':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'synthetic_footage':False,'seconds':round(time.perf_counter()-started,3)})
        (OUT/'video_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(manifest[-1],ensure_ascii=False),flush=True)
    black=OUT/'synthetic_no_person.mp4'
    writer=cv2.VideoWriter(str(black),cv2.VideoWriter_fourcc(*'mp4v'),10,(320,240))
    assert writer.isOpened()
    for _ in range(30):writer.write(np.zeros((240,320,3),dtype=np.uint8))
    writer.release()
    with black.open('rb') as stream:
        r=client.post('http://127.0.0.1:8001/api/analyze-video',data={'exercise':'squat','include_coach':'false'},files={'file':(black.name,stream,'video/mp4')})
    r.raise_for_status()
    (OUT/'video_insufficient.json').write_text(json.dumps(r.json(),ensure_ascii=False,indent=2),encoding='utf-8')
    manifest.append({'key':'insufficient','video':str(black),'synthetic_footage':True,'purpose':'No-person failure fixture; real inference, not a real exercise recording.'})
    (OUT/'video_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print('All video contexts prepared.',flush=True)
