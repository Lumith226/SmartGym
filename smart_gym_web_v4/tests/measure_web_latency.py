"""Repeated real-browser timing of the deployed V4 floor models, no training."""
from pathlib import Path
import hashlib
import json
import math
import platform
import subprocess
import time
import urllib.request
from datetime import datetime, timezone

import cv2
import numpy as np
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / 'smart_gym_web_v4'
APP = ROOT / 'smart_gym_test_rtmpose_v4'
OUT = WEB / 'runtime/latency_experiment'
OUT.mkdir(exist_ok=True)
SECONDS = 15
WARMUP = 3
REPEATS = 3


def health():
    with urllib.request.urlopen('http://127.0.0.1:8001/api/health', timeout=5) as r:
        return json.load(r)


def prepare(stem, folder):
    report = json.loads((APP/f'logs/benchmark_{stem}_v4.json').read_text(encoding='utf-8'))
    rows = [r for r in report['videos'] if r['quality']['usable']]
    selected = max(rows, key=lambda r: (r['quality']['valid_frame_ratio'], len(r['detected_labels'])))
    src = APP/'test_videos_benchmark'/folder/selected['video']
    cap = cv2.VideoCapture(str(src)); fps = cap.get(cv2.CAP_PROP_FPS); frames = []
    while True:
        ok, frame = cap.read()
        if not ok: break
        frames.append(frame)
    cap.release()
    assert frames and fps > 0
    h, w = frames[0].shape[:2]
    video = OUT/f'{stem}_repeated.webm'
    writer = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*'VP80'), fps, (w,h))
    if not writer.isOpened(): raise RuntimeError('Cannot encode VP8 timing fixture')
    count = math.ceil(22*fps)
    for i in range(count): writer.write(frames[i % len(frames)])
    writer.release()
    fake = OUT/f'{stem}_camera.y4m'
    with fake.open('wb') as stream:
        stream.write(f'YUV4MPEG2 W{w} H{h} F{round(fps)}:1 Ip A1:1 C420\n'.encode())
        for frame in frames:
            stream.write(b'FRAME\n'); stream.write(cv2.cvtColor(frame,cv2.COLOR_BGR2YUV_I420).tobytes())
    return {'source': str(src.relative_to(ROOT)), 'source_sha256': hashlib.sha256(src.read_bytes()).hexdigest(),
            'video': str(video), 'camera': str(fake), 'source_fps': fps, 'source_size': [w,h],
            'fixture_duration_s': count/fps}


def quantiles(values):
    a = np.asarray([v for v in values if v is not None], dtype=float)
    if not len(a): return None
    return {'n': len(a), 'mean': float(a.mean()), 'p50': float(np.percentile(a,50)),
            'p95': float(np.percentile(a,95)), 'min': float(a.min()), 'max': float(a.max())}


def summarize(trial):
    frames = [r for r in trial['frames'] if WARMUP*1000 <= r['elapsed_ms'] < SECONDS*1000]
    assert len(frames) >= 30, ('Insufficient frames',len(frames))
    first = next((r for r in trial['frames'] if r['scored']),None)
    assert first, 'No classifier output for this exercise'
    distinct=[];signature=None
    for row in trial['frames']:
        if row['prediction_signature'] and row['prediction_signature'] != signature:
            signature=row['prediction_signature'];distinct.append(row)
    updates=[r for r in distinct if r['elapsed_ms']>=WARMUP*1000]
    intervals=np.diff([r['received_elapsed_ms'] for r in updates]).tolist()
    span=(frames[-1]['received_elapsed_ms']-frames[0]['received_elapsed_ms'])/1000
    return {'steady_frames':len(frames),'analysis_fps':(len(frames)-1)/span,
            'first_scored_result_ms':first['received_elapsed_ms'],
            'fresh_result_interval_ms':quantiles(intervals),
            'classifier_ms':quantiles([r['classifier_ms'] for r in updates]),
            'found_ratio':float(np.mean([r['found'] for r in frames])),
            **{k:quantiles([r.get(k) for r in frames]) for k in
               ('capture_to_receive_ms','capture_to_dom_raf_ms','send_to_receive_ms',
                'capture_to_send_ms','server_ms','pose_ms')}}


def main():
    initial=health(); assert initial['ready']
    fixtures={s:prepare(s,f) for s,f in [('pushup','pushups'),('crunch','reverse_crunches')]}
    experiment={'started_utc':datetime.now(timezone.utc).isoformat(),'python':platform.python_version(),
                'platform':platform.platform(),'opencv':cv2.__version__,'initial_health':initial,
                'seconds_per_trial':SECONDS,'steady_warmup_seconds':WARMUP,'repeats':REPEATS,
                'fixtures':fixtures,'trials':[], 'whole_video_trials':[],
                'physical_webcam_tested':False,'concurrency_note':'One instrumented analysis session; other connected pages and machine workloads are not forcibly closed.'}
    with sync_playwright() as p:
        exe=Path.home()/'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
        for stem,exercise,key in [('pushup','push_up','2'),('crunch','situp','4')]:
            fixture=fixtures[stem]
            for mode in ('video','camera_simulated'):
                args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']
                if mode=='camera_simulated':args += [f'--use-file-for-fake-video-capture={fixture["camera"]}']
                browser=p.chromium.launch(headless=True,executable_path=str(exe) if exe.is_file() else None,args=args)
                experiment['browser_version']=browser.version
                for repeat in range(1,REPEATS+1):
                    context=browser.new_context(viewport={'width':1440,'height':1100},permissions=['camera'])
                    context.add_init_script(path=str(WEB/'tests/latency_probe.js'))
                    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                    page.goto('http://localhost:8080',wait_until='networkidle')
                    page.get_by_text('Server AI đã sẵn sàng',exact=True).wait_for(timeout=30000)
                    page.keyboard.press(key)
                    if mode=='video':
                        page.locator('#video-source').click()
                        page.locator('#video-file').set_input_files(fixture['video'])
                        page.locator('#start-analysis:not([disabled])').wait_for()
                        page.evaluate("document.querySelector('#preview').pause();document.querySelector('#preview').currentTime=0")
                    else:
                        page.locator('#open-camera').click()
                        page.wait_for_function("document.querySelector('#notice').textContent.includes('Camera đã mở')",timeout=15000)
                    page.locator('#start-analysis:not([disabled])').wait_for()
                    before=health();page.locator('#start-analysis').click()
                    page.wait_for_timeout(SECONDS*1000)
                    page.evaluate('window.__latency.active=false')
                    trial=page.evaluate('window.__latency')
                    trial.update(exercise=exercise,stem=stem,mode=mode,repeat=repeat,health_before=before,
                                 ui_metrics={name:page.locator('#'+name).inner_text() for name in ('display-fps','analysis-fps','roundtrip-ms')},javascript_errors=errors)
                    assert not errors and not trial['errors'],(errors,trial['errors'])
                    trial['summary']=summarize(trial)
                    experiment['trials'].append(trial)
                    print('TRIAL',stem,mode,repeat,json.dumps(trial['summary'],ensure_ascii=False),flush=True)
                    if mode=='video':
                        page.locator('#start-analysis').click()
                        for _ in range(1):
                            page.locator('#analyze-whole').click()
                            page.wait_for_function("document.querySelector('#notice').textContent.includes('Đã phân tích toàn video')",timeout=90000)
                            page.wait_for_timeout(100)
                            fetch=page.evaluate('window.__latency.fetches.at(-1)')
                            assert fetch['status']==200 and fetch['scored'] and fetch['dom_raf_ms']>0
                            experiment['whole_video_trials'].append({'exercise':exercise,'repeat':repeat,'fixture_duration_s':fixture['fixture_duration_s'],**fetch})
                    if repeat==1:page.screenshot(path=str(OUT/f'{stem}_{mode}.png'),full_page=True)
                    context.close()
                    (OUT/'web_latency_raw.json').write_text(json.dumps(experiment,ensure_ascii=False,indent=2),encoding='utf-8')
                browser.close()
    experiment['finished_utc']=datetime.now(timezone.utc).isoformat();experiment['complete']=True
    (OUT/'web_latency_raw.json').write_text(json.dumps(experiment,ensure_ascii=False,indent=2),encoding='utf-8')
    print('LATENCY_EXPERIMENT_COMPLETE',flush=True)


if __name__=='__main__':main()
