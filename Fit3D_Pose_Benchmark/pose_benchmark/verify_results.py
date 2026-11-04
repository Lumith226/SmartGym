"""Audit actual outputs and media before delivering the benchmark report."""
import csv,hashlib,json,os
from pathlib import Path
import cv2,numpy as np
from adapters import BASE,MODELS
from application import APP,source_hashes
from dataset import gt_for
R=Path(os.environ.get('POSE_BENCHMARK_RESULTS',str(BASE/'results')))

def main():
 manifest=json.loads((R/'run_manifest.json').read_text())
 expected={(m,c['id']) for m in manifest['models'] for c in manifest['clips']}
 rows=json.loads((R/'all_measured_results.json').read_text(encoding='utf-8'))
 actual={(r['model'],r['clip']['id']) for r in rows}
 assert actual==expected and len(rows)==len(expected)
 assert source_hashes()==manifest['source_hashes'],'Fixed source code changed'
 grid={};frames=0
 for r in rows:
  data=np.load(R/'predictions'/(r['model']+'__'+r['clip']['id']+'.npz'))
  ids=data['ids'];pred=data['pred'];gt=data['gt']
  assert pred.shape==(len(ids),17,3) and gt.shape==(len(ids),25,2)
  assert np.isfinite(pred).all() and np.isfinite(gt).all()
  assert abs(r['source_fps']-50)<.01 and abs(r['analysis_sampling_fps']-25)<.01
  assert r['frame_count']==len(ids)
  assert np.all(np.diff(ids)==manifest['stride'])
  key=r['clip']['id']
  if key not in grid:
   projected,valid=gt_for(r['clip'],ids)
   assert valid.all() and np.allclose(gt,projected,atol=1e-5,rtol=0),'Cached GT differs from current calibrated Fit3D inputs'
   grid[key]=(ids.copy(),gt.copy())
  else:assert np.array_equal(ids,grid[key][0]) and np.array_equal(gt,grid[key][1]),'Models saw different frame IDs / GT'
  assert 0<=r['pck_torso_020_pct']<=100 and r['pipeline_fps']>0
  assert r['application']['form_accuracy'] is None
  frames+=len(ids)
 with (R/'comparison_by_exercise_camera.csv').open(encoding='utf-8-sig',newline='') as f:assert len(list(csv.DictReader(f)))==len(expected)
 if R.name=='results_full':
  with (R/'comparison_camera_summary.csv').open(encoding='utf-8-sig',newline='') as f:
   grouped=list(csv.DictReader(f));assert len(grouped)==80 and all(int(r['subjects'])==8 and int(r['clips'])==8 for r in grouped)
 smoke=json.loads((R/'gpu_smoke.json').read_text())
 assert {x['model'] for x in smoke}==set(MODELS)
 assert all(x.get('provider_events',{}).get('DmlExecutionProvider',0)>0 for x in smoke)
 media=[]
 for video in sorted((R/'comparisons').glob('*.mp4')):
  cap=cv2.VideoCapture(str(video));count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT));fps=cap.get(cv2.CAP_PROP_FPS)
  assert cap.isOpened() and count>20 and abs(fps-25)<.1
  if R.name=='results_full':
   cid=video.stem;expected_frames=next(r['frame_count'] for r in rows if r['clip']['id']==cid)
   assert count==expected_frames,'Comparison video does not cover the full evaluated frame grid: '+cid
  assert int(cap.get(3))==1600 and int(cap.get(4))==784
  for index in [0,count//2,count-1]:
   cap.set(cv2.CAP_PROP_POS_FRAMES,index);ok,frame=cap.read();assert ok and frame.shape==(784,1600,3)
  fourcc=int(cap.get(cv2.CAP_PROP_FOURCC));codec=''.join(chr((fourcc>>(8*i))&255) for i in range(4))
  assert codec.lower() in ['h264','avc1'],'Comparison video is not H.264'
  if R.name=='results_full':
   encoding=json.loads(video.with_suffix('.encoding.json').read_text())
   assert encoding['frames']==count and encoding['size']==[1600,784] and encoding['encoder'] in ['h264_amf','libx264']
  media.append(dict(file=video.name,frames=count,fps=fps,codec=codec));cap.release()
 expected_media=len(manifest['clips']) if R.name=='results_full' else 8
 assert len(media)==expected_media
 if R.name=='results_full':
  assert {Path(v['file']).stem for v in media}=={c['id'] for c in manifest['clips']}
 figures=list((R/'figures').glob('*.png'));assert len(figures)>=10
 if R.name=='results_full':
  required={f'{ex}_{suffix}.png' for ex in ['squat','pushup'] for suffix in ['summary','cameras','views','joints','stability','uncertainty','thresholds','subjects','occlusion','form_stability']}
  assert required<={p.name for p in figures},'Missing required comparison figures'
 for image in figures+list((R/'comparisons').glob('*.jpg')):
  data=cv2.imread(str(image));assert data is not None and data.shape[0]>300
 assert len(list((R/'comparisons').glob('*.jpg')))==expected_media
 result=dict(passed=True,model_clip_rows=len(rows),pose_frames_total=frames,identical_frame_and_gt_grid_per_clip=True,ground_truth_reprojected_from_inputs=True,fixed_source_hashes_verified=True,gpu_model_count=len(smoke),figures=len(figures),comparison_videos=media,form_accuracy_not_fabricated=True)
 (R/'VERIFICATION.json').write_text(json.dumps(result,indent=2))
 print(json.dumps(result,indent=2))

if __name__=='__main__':main()
