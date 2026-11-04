"""Fit3D geometry using the dataset authors' projection convention."""
import json
from pathlib import Path
import cv2
import numpy as np

ROOT=Path(r'E:\do an\fit3d')
# Native Fit3D 25-joint layout, checked on the authors' projected overlays.
# Lower-limb left/right ordering must not be assumed from another H36M export.
# Compare only anatomically corresponding limb joints, not head proxies.
COCO=np.arange(5,17)
FIT=np.array([11,14,12,15,13,16,1,4,2,5,3,6])
NAMES=['left_shoulder','right_shoulder','left_elbow','right_elbow','left_wrist','right_wrist','left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle']
PAIRS=[(0,1),(2,3),(4,5),(6,7),(8,9),(10,11)]

def load(path):return json.loads(Path(path).read_text(encoding='utf-8'))

def project(joints,cam):
    e=cam['extrinsics']; xyz=(joints-np.asarray(e['T']))@np.asarray(e['R']).T
    ins=cam['intrinsics_w_distortion']; x=xyz[...,:2]/xyz[...,2:3]
    p=np.asarray(ins['p'])[:,[1,0]]; r2=np.sum(x*x,axis=-1)
    k=np.asarray(ins['k']).ravel()
    radial=1+k[0]*r2+k[1]*r2**2+k[2]*r2**3
    tan=np.sum(x*p,axis=-1)
    return np.asarray(ins['f'])*(x*(tan+radial)[...,None]+r2[...,None]*p)+np.asarray(ins['c'])

def clips(subjects=None):
    train=ROOT/'fit3d_train/train'
    for sub in sorted(train.iterdir()):
        if subjects and sub.name not in subjects:continue
        ann=load(sub/'rep_ann.json')
        for exercise in ['squat','pushup']:
            gt=sub/'joints3d_25'/f'{exercise}.json'
            for camdir in sorted((sub/'videos').iterdir()):
                v=camdir/f'{exercise}.mp4'; c=sub/'camera_parameters'/camdir.name/f'{exercise}.json'
                if v.exists() and c.exists() and gt.exists():
                    yield dict(id=f'{sub.name}_{exercise}_{camdir.name}',subject=sub.name,exercise=exercise,camera=camdir.name,video=str(v),camera_file=str(c),gt_file=str(gt),rep_boundaries=ann.get(exercise,[]),split='train_evaluation_only')

def read_frames(clip,stride=2,limit=None):
    cap=cv2.VideoCapture(clip['video'])
    if not cap.isOpened():raise RuntimeError('Cannot read '+clip['video'])
    fps=cap.get(cv2.CAP_PROP_FPS)
    ids=[]; frames=[]; i=0
    while True:
        ok,f=cap.read()
        if not ok:break
        if i%stride==0:
            ids.append(i); frames.append(f)
            if limit and len(frames)>=limit:break
        i+=1
    cap.release()
    return np.array(ids),frames,fps

def gt_for(clip,ids):
    j=np.asarray(load(clip['gt_file'])['joints3d_25'],dtype=np.float32)
    valid=ids<len(j)
    return project(j[ids[valid]],load(clip['camera_file'])),valid

if __name__=='__main__':
    out=Path(__file__).resolve().parent/'results';out.mkdir(exist_ok=True)
    data=list(clips())
    (out/'dataset_manifest.json').write_text(json.dumps(data,indent=2))
    print('Matching clips:',len(data),'subjects:',sorted({x['subject'] for x in data}))
    for ex in ['squat','pushup']:print(ex,sum(x['exercise']==ex for x in data))
    imgs=[]
    for clip in clips(['s03']):
        ids,frames,fps=read_frames(clip,stride=100,limit=3)
        gt,valid=gt_for(clip,ids)
        f=frames[-1].copy()
        for k,pt in enumerate(gt[-1]):
            cv2.circle(f,tuple(pt.astype(int)),4,(0,255,255),-1)
            cv2.putText(f,str(k),tuple(pt.astype(int)),cv2.FONT_HERSHEY_SIMPLEX,.4,(0,0,255),1)
        f=cv2.resize(f,(450,450));cv2.putText(f,clip['exercise']+' '+clip['camera'],(10,25),cv2.FONT_HERSHEY_SIMPLEX,.6,(0,255,255),2)
        imgs.append(f)
    cv2.imwrite(str(out/'projection_audit.jpg'),np.vstack([np.hstack(imgs[:4]),np.hstack(imgs[4:])]))
