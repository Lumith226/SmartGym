"""Exercise-relative camera azimuth from calibrated camera centers and MoCap.

Squat: 0 degrees is in front of the person; 180 is behind.
Push-up: 0 is the head end; 180 is the feet end; 90 is a side view.
These definitions are exercise-specific, not generic facial pose labels.
"""
import json
from pathlib import Path
import numpy as np
from dataset import load

def describe(clip,ids=None):
 joints=np.array(load(clip['gt_file'])['joints3d_25'])
 lo,hi=clip['rep_boundaries'][0],clip['rep_boundaries'][-1]
 joints=joints[lo:hi+1]
 shoulder=(joints[:,11]+joints[:,14])/2
 hip=(joints[:,1]+joints[:,4])/2
 center=(shoulder+hip)/2
 cam=np.array(load(clip['camera_file'])['extrinsics']['T']).reshape(3)
 if clip['exercise']=='squat':
  left=(joints[:,11]-joints[:,14])+(joints[:,1]-joints[:,4])
  axis=np.cross(left,np.array([0,0,1]))
 else:axis=shoulder-hip
 axis[:,2]=0;view=cam-center
 horizontal=view.copy();horizontal[:,2]=0
 denom=np.linalg.norm(axis,axis=-1)*np.linalg.norm(horizontal,axis=-1)
 valid=denom>1e-6
 cosine=np.sum(axis*horizontal,axis=-1)[valid]/denom[valid]
 angle=float(np.median(np.rad2deg(np.arccos(np.clip(cosine,-1,1)))))
 elevation=float(np.median(np.rad2deg(np.arctan2(view[:,2],np.linalg.norm(view[:,:2],axis=-1)))))
 category=0 if angle<30 else 1 if angle<60 else 2 if angle<=120 else 3 if angle<=150 else 4
 labels=['Trước','Chéo trước','Ngang','Chéo sau','Sau'] if clip['exercise']=='squat' else ['Phía đầu','Chéo phía đầu','Ngang','Chéo phía chân','Phía chân']
 return dict(relative_azimuth_deg=angle,elevation_from_torso_deg=elevation,view_category=category,view_label_vi=labels[category],definition='squat: 0=front, 90=side, 180=rear; pushup: 0=head end, 90=side, 180=feet end')

if __name__=='__main__':
 from dataset import clips
 for c in clips(['s03','s04']):print(c['id'],json.dumps(describe(c),ensure_ascii=True))
