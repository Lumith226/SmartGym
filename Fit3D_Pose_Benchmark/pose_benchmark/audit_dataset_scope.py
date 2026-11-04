"""Read-only inventory and warmup contact sheets for exercise matching."""
import json,math
from pathlib import Path
import cv2,numpy as np
from adapters import BASE
from dataset import ROOT,clips,load,project
from camera_view import describe

R=BASE/'results_full';D=R/'dataset_audit';D.mkdir(parents=True,exist_ok=True)
items=list(clips());views=[dict(clip_id=c['id'],subject=c['subject'],exercise=c['exercise'],camera=c['camera'],**describe(c)) for c in items]
(D/'camera_inventory.json').write_text(json.dumps(views,ensure_ascii=False,indent=2),encoding='utf-8')
train=ROOT/'fit3d_train/train';inventory=[]
for subject in sorted(train.iterdir()):
 ann=load(subject/'rep_ann.json')
 for camdir in sorted((subject/'videos').iterdir()):
  for p in sorted(camdir.glob('*.mp4')):
   inventory.append(dict(subject=subject.name,camera=camdir.name,action=p.stem,has_joints=(subject/'joints3d_25'/f'{p.stem}.json').exists(),has_rep_markers=len(ann.get(p.stem,[]))>=2))
(D/'training_inventory.json').write_text(json.dumps(inventory,indent=2))
subject=train/'s03';camera='60457274';ann=load(subject/'rep_ann.json');sheets=[]
for action in [f'warmup_{i}' for i in range(1,20)]:
 video=subject/'videos'/camera/f'{action}.mp4'
 if not video.exists():continue
 cap=cv2.VideoCapture(str(video));n=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
 ids=np.linspace(n*.1,n*.9,6,dtype=int);j=np.array(load(subject/'joints3d_25'/f'{action}.json')['joints3d_25'])
 gt=project(j[np.minimum(ids,len(j)-1)],load(subject/'camera_parameters'/camera/f'{action}.json'))
 lo=gt.reshape(-1,2).min(0);hi=gt.reshape(-1,2).max(0);center=(lo+hi)/2;side=int(np.max(hi-lo)*1.25);origin=np.floor(center-side/2).astype(int)
 panels=[]
 for frame_id in ids:
  cap.set(cv2.CAP_PROP_POS_FRAMES,int(frame_id));ok,f=cap.read()
  if not ok:raise RuntimeError(str(video))
  canvas=np.zeros((side,side,3),np.uint8);x,y=origin;a,b=max(0,x),max(0,y);c,d=min(f.shape[1],x+side),min(f.shape[0],y+side)
  canvas[b-y:d-y,a-x:c-x]=f[b:d,a:c];canvas=cv2.resize(canvas,(240,240));cv2.putText(canvas,f'frame {frame_id}',(5,22),0,.55,(0,255,255),1);panels.append(canvas)
 cap.release();header=np.full((36,1440,3),24,np.uint8)
 cv2.putText(header,f'{action} | s03 camera {camera} | frames {n} | supplied rep intervals: {max(0,len(ann.get(action,[]))-1)}',(12,25),0,.65,(255,255,255),1)
 sheets.append(np.vstack([header,np.hstack(panels)]))
for start in range(0,len(sheets),5):
 path=D/f'warmups_{start+1:02d}_{min(start+5,len(sheets)):02d}.jpg';cv2.imwrite(str(path),np.vstack(sheets[start:start+5]));print(path,flush=True)
print('Available calibrated exact-match clips:',len(items),'training video inventory:',len(inventory),flush=True)
for ex in ['squat','pushup']:
 v=[r for r in views if r['exercise']==ex]
 print(ex,'angles',min(r['relative_azimuth_deg'] for r in v),max(r['relative_azimuth_deg'] for r in v),'categories',sorted({r['view_category'] for r in v}),flush=True)
