"""Try historically observable recordings; keep insufficient first inputs too."""
import json,time,hashlib
from pathlib import Path
import httpx
ROOT=Path(__file__).resolve().parents[1];WORKSPACE=ROOT.parents[2]
MODEL=WORKSPACE/'SmartGym-Model/smart_gym_test_rtmpose_v4'
OUT=ROOT/'artifacts/manual_suite_20261107';rows=[]
with httpx.Client(timeout=600) as client:
    for key,stem,folder in [('push_up','pushup','pushups'),('situp','crunch','reverse_crunches')]:
        path=OUT/f'video_{key}.json'
        first=OUT/f'video_{key}_insufficient_first.json'
        if not first.exists():first.write_bytes(path.read_bytes())
        benchmark=json.loads((MODEL/f'logs/benchmark_{stem}_v4.json').read_text(encoding='utf-8'))
        candidates=[r for r in benchmark['videos'] if r['quality']['usable']]
        candidates.sort(key=lambda r:-r['quality']['valid_frame_ratio'])
        for row in candidates[:3]:
            video=MODEL/'test_videos_benchmark'/folder/row['video'];start=time.perf_counter()
            with video.open('rb') as stream:
                r=client.post('http://127.0.0.1:8001/api/analyze-video',data={'exercise':key,'include_coach':'false'},files={'file':(video.name,stream,'video/mp4')})
            r.raise_for_status();data=r.json()
            entry={'key':key,'video':str(video),'sha256':hashlib.sha256(video.read_bytes()).hexdigest(),
                   'usable':data['result']['quality']['usable'],'seconds':round(time.perf_counter()-start,3)}
            rows.append(entry)
            (OUT/f'alternative_{key}_{video.stem}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps(entry,ensure_ascii=False),flush=True)
            if entry['usable']:
                path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');break
        (OUT/'alternative_video_manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
