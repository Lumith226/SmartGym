from pathlib import Path
import cv2,numpy as np
BASE=Path(__file__).resolve().parent
tiles=[]
for f in sorted((BASE/'results/predictions').glob('YOLOv8n-Pose__s03_pushup*.npz')):
 d=np.load(f);i=len(d['ids'])//2;cam=f.stem.split('_')[-1]
 cap=cv2.VideoCapture(str(Path(r'E:\do an\fit3d\fit3d_train\train\s03\videos')/cam/'pushup.mp4'))
 cap.set(cv2.CAP_PROP_POS_FRAMES,int(d['ids'][i]));ok,img=cap.read();cap.release()
 if not ok:continue
 for j,xy in enumerate(d['gt'][i]):
  cv2.circle(img,tuple(xy.astype(int)),5,(0,255,0),-1)
  cv2.putText(img,str(j),tuple(xy.astype(int)),0,.4,(0,255,0),1)
 for j,(x,y,c) in enumerate(d['pred'][i]):
  if c>.1:
   cv2.circle(img,(int(x),int(y)),7,(255,0,255),2)
   cv2.putText(img,str(j),(int(x),int(y)),0,.4,(255,0,255),1)
 img=cv2.resize(img,(450,450));cv2.putText(img,cam,(10,25),0,.7,(0,255,255),2);tiles.append(img)
if tiles:cv2.imwrite(str(BASE/'results/pushup_alignment_audit.jpg'),np.hstack(tiles))
