"""Render saved inference results again after UI changes; no model fitting/inference."""
import json
from pathlib import Path
import cv2
import numpy as np
from app import render_dashboard, draw_skeleton
from video_tools import preview_frame
from squat_schema import sha256, write_json

APP=Path(__file__).resolve().parent


def render(path,result,exercise,destination):
    cache=APP/'logs/benchmark_pose_cache'/(sha256(path)+'_'+exercise+'.npz')
    with np.load(cache) as saved:
        assert str(saved['fingerprint'])==sha256(path)+':'+result['schema_version']
        raw=saved['raw']
    frame,kpts=preview_frame(path,result,raw);draw_skeleton(frame,kpts)
    image=render_dashboard(frame,result,source=path.name,view='Toàn video')
    destination.parent.mkdir(parents=True,exist_ok=True)
    cv2.imencode('.png',image)[1].tofile(str(destination))


def main():
    sources={};total=0
    for exercise,folder in [('squat','squats'),('jumpjack','jumping_jacks')]:
        report_path=APP/f'logs/benchmark_{exercise}_v4.json'
        sources[report_path.name]=sha256(report_path)
        report=json.loads(report_path.read_text(encoding='utf-8'))
        for row in report['videos']:
            path=APP/'test_videos_benchmark'/folder/row['video']
            render(path,row,exercise,APP/row['preview_file']);total+=1
        result_path=APP/f'logs/single_{exercise}_v4_verified.json'
        if result_path.is_file():
            result=json.loads(result_path.read_text(encoding='utf-8'))
            path=APP/'test_videos_benchmark'/folder/result['source']['file']
            render(path,result,exercise,result_path.with_suffix('.png'))
        assert sha256(report_path)==sources[report_path.name]
    write_json(APP/'logs/preview_render_manifest_v4.json',{'rendered_benchmark_images':total,
               'source_sha256':sources,'inference_changed':False,'thresholds_changed':False})
    print('Rendered',total,'benchmark previews and verified single-video snapshots from saved results.')


if __name__=='__main__':main()
