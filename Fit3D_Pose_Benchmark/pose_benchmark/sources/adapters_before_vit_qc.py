"""Single-person FP32 adapters. All neural inference uses DirectML device 0."""
import json,time
from pathlib import Path
import cv2
import numpy as np
import onnxruntime as ort

BASE=Path(__file__).resolve().parent
W=BASE/'weights'
MODELS={
 'YOLOv8n-Pose':('yolov8n-pose.onnx','yolo'),
 'YOLO11n-Pose':('yolo11n-pose.onnx','yolo'),
 'YOLO26n-Pose':('yolo26n-pose.onnx','yolo'),
 'RTMPose-m':('rtmpose_m.onnx','rtmpose'),
 'RTMO-s':('rtmo_s.onnx','rtmo'),
 'ViTPose-B':('vitpose_base.onnx','vitpose'),
 'HRNet':('hrnet_w32.onnx','heatmap'),
 'Lite-HRNet':('litehrnet_core.onnx','heatmap'),
 'MoveNet-Lightning':('movenet_lightning.onnx','movenet'),
 'LitePose-Auto-S':('litepose.onnx','litepose'),
}

class Engine:
 def __init__(self,path,profile=False):
  if 'DmlExecutionProvider' not in ort.get_available_providers():raise RuntimeError('GPU required: DirectML unavailable')
  opts=ort.SessionOptions();opts.enable_mem_pattern=False;opts.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL
  opts.intra_op_num_threads=2;opts.log_severity_level=3
  opts.enable_profiling=profile
  if profile:
   (BASE/'results/profiles').mkdir(parents=True,exist_ok=True)
   opts.profile_file_prefix=str(BASE/'results/profiles'/Path(path).stem)
  self.session=ort.InferenceSession(str(path),sess_options=opts,providers=[('DmlExecutionProvider',{'device_id':'0'}),'CPUExecutionProvider'])
  if self.session.get_providers()[0]!='DmlExecutionProvider':raise RuntimeError('GPU provider not active')
  self.name=self.session.get_inputs()[0].name
  self.shape=self.session.get_inputs()[0].shape
  self.dtype=self.session.get_inputs()[0].type
  self.last_ms=0
 def run(self,x):
  t=time.perf_counter();out=self.session.run(None,{self.name:np.ascontiguousarray(x)})
  self.last_ms=(time.perf_counter()-t)*1000
  return out
 def finish_profile(self):
  p=self.session.end_profiling()
  events=json.loads(Path(p).read_text())
  counts={}
  for e in events:
   ep=e.get('args',{}).get('provider')
   if ep:counts[ep]=counts.get(ep,0)+1
  return dict(profile=p,provider_events=counts)

def letterbox(frame,size=640,position='center'):
 h,w=frame.shape[:2]; ratio=min(size/w,size/h)
 nw,nh=round(w*ratio),round(h*ratio)
 left=(size-nw)//2 if position=='center' else 0; top=(size-nh)//2 if position=='center' else 0
 out=np.full((size,size,3),114,np.uint8)
 out[top:top+nh,left:left+nw]=cv2.resize(frame,(nw,nh))
 return out,ratio,np.array([left,top],np.float32)

def get_box(frame,engine):
 f,ratio,pad=letterbox(frame)
 x=f[:,:,::-1].transpose(2,0,1)[None].astype(np.float32)/255
 y=engine.run(x)[0][0].T
 # YOLOv8 detection: 4 box channels + 80 classes. Person is COCO class 0.
 candidates=np.where((y[:,4]>.3)&(np.argmax(y[:,4:],axis=1)==0))[0]
 if not len(candidates):return None
 idx=candidates[np.argmax(y[candidates,2]*y[candidates,3])]
 cx,cy,bw,bh=y[idx,:4]
 return (np.array([cx-bw/2,cy-bh/2,cx+bw/2,cy+bh/2])-np.tile(pad,2))/ratio

def affine_crop(frame,bbox,size,padding=1.25):
 w,h=size; bbox=np.asarray(bbox,np.float32)
 center=(bbox[:2]+bbox[2:])/2; scale=(bbox[2:]-bbox[:2])*padding
 scale=np.maximum(scale,2)
 if scale[0]/scale[1]>w/h:scale[1]=scale[0]*h/w
 else:scale[0]=scale[1]*w/h
 transform=np.array([[w/scale[0],0,w/2-center[0]*w/scale[0]],[0,h/scale[1],h/2-center[1]*h/scale[1]]],np.float32)
 crop=cv2.warpAffine(frame,transform,(w,h),flags=cv2.INTER_LINEAR)
 return crop,center,scale

def decode_heatmap(hm):
 if hm.ndim==4:hm=hm[0]
 k,h,w=hm.shape;flat=hm.reshape(k,-1);ix=flat.argmax(1)
 xy=np.stack([ix%w,ix//w],axis=1).astype(np.float32)
 scores=flat.max(1)
 # Conventional quarter-pixel heatmap refinement (no flip or test-time augmentation).
 for j,(x,y) in enumerate(xy.astype(int)):
  if 1<x<w-1 and 1<y<h-1:
   xy[j]+=.25*np.sign([hm[j,y,x+1]-hm[j,y,x-1],hm[j,y+1,x]-hm[j,y-1,x]])
 return xy,scores,(w,h)

class Pose:
 def __init__(self,name,profile=False):
  self.name=name; fn,self.kind=MODELS[name];self.engine=Engine(W/fn,profile)
  self.last_ms=0;self.inference_ms=0
 def __call__(self,frame,bbox=None):
  t=time.perf_counter();h,w=frame.shape[:2];kind=self.kind
  if kind in ['rtmpose','vitpose','qai_heatmap','heatmap','movenet'] and bbox is None:
   return np.zeros((17,3),np.float32)
  if kind=='yolo':
   im,r,pad=letterbox(frame); x=im[:,:,::-1].transpose(2,0,1)[None].astype(np.float32)/255
   raw=self.engine.run(x)[0][0]
   if raw.shape[-1]==57:
    row=raw[np.argmax(raw[:,4])];score=row[4];kpt=row[6:].reshape(17,3).copy()
   else:
    raw=raw.T;row=raw[np.argmax(raw[:,4])];score=row[4];kpt=row[5:].reshape(17,3).copy()
   kpt[:,:2]=(kpt[:,:2]-pad)/r
   if score<.25:kpt[:]=0
  elif kind=='rtmo':
   im,r,pad=letterbox(frame,position='top_left')
   out=self.engine.run(im.transpose(2,0,1)[None].astype(np.float32))
   det,pose=out;idx=int(np.argmax(det[0,:,4]));kpt=pose[0,idx].copy();kpt[:,:2]/=r
   if det[0,idx,4]<.3:kpt[:]=0
  elif kind=='movenet':
   # Preserve aspect ratio using a square crop around the common detector box.
   crop,c,s=affine_crop(frame,bbox,(192,192),padding=1.25)
   rgba=cv2.cvtColor(crop,cv2.COLOR_BGR2RGBA)
   out=self.engine.run(rgba[None])[0].reshape(17,3)
   kpt=out[:,[1,0,2]].copy();kpt[:,:2]=kpt[:,:2]*s+c-s/2
  elif kind in ['rtmpose','vitpose','qai_heatmap','heatmap']:
   shape=self.engine.shape
   ih=shape[-2] if isinstance(shape[-2],int) else 256
   iw=shape[-1] if isinstance(shape[-1],int) else 192
   crop,c,s=affine_crop(frame,bbox,(iw,ih))
   rgb=crop[:,:,::-1].astype(np.float32)
   if kind=='qai_heatmap':x=rgb/255
   else:x=(rgb-np.array([123.675,116.28,103.53],np.float32))/np.array([58.395,57.12,57.375],np.float32)
   out=self.engine.run(x.transpose(2,0,1)[None].astype(np.float32))
   if kind=='rtmpose':
    sx,sy=out; xy=np.stack([sx[0].argmax(-1),sy[0].argmax(-1)],axis=-1)/2
    scores=(sx[0].max(-1)+sy[0].max(-1))/2
    xy=xy/np.array([iw,ih])*s+c-s/2
   else:
    hm=next(o for o in out if o.ndim==4 and o.shape[1]==17);xy,scores,(hw,hh)=decode_heatmap(hm)
    if kind=='vitpose':
     from rtmlib.tools.pose_estimation.post_processings import post_dark_udp
     xy=post_dark_udp(xy[None],hm.copy(),kernel=11)[0]
     xy=xy/np.array([hw-1,hh-1])*s+c-s/2
    else:xy=xy/np.array([hw,hh])*s+c-s/2
   kpt=np.column_stack([xy,scores]).astype(np.float32)
  elif kind=='litepose':
   # Original bottom-up single-scale image normalization, no GT crop.
   ih,iw=self.engine.shape[-2:]
   # This OpenVINO export already folds ImageNet scaling into its weights
   # and subtracts BGR mean [104,116,124] in the graph.
   crop=cv2.resize(frame,(iw,ih));x=crop.astype(np.float32)
   out=self.engine.run(x.transpose(2,0,1)[None].astype(np.float32))
   heatmaps=[o[:,:17] for o in out if o.ndim==4 and o.shape[1]>=17]
   target=max(heatmaps,key=lambda a:a.shape[-1]*a.shape[-2]);hh,hw=target.shape[-2:]
   hm=np.mean([np.stack([cv2.resize(ch,(hw,hh)) for ch in o[0]])[None] for o in heatmaps],axis=0)
   xy,scores,(hw,hh)=decode_heatmap(hm)
   xy=xy/np.array([hw,hh])*np.array([w,h]);kpt=np.column_stack([xy,scores]).astype(np.float32)
  else:raise ValueError(kind)
  self.inference_ms=self.engine.last_ms;self.last_ms=(time.perf_counter()-t)*1000
  return kpt

if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument('--models',nargs='*');a=parser.parse_args()
 f=cv2.imread(str(BASE/'sample.jpg'))
 detector=Engine(W/'yolov8n.onnx',profile=True);bbox=get_box(f,detector)
 print('BBOX',bbox,flush=True)
 records=[]
 for name in a.models or MODELS:
  try:
   m=Pose(name,profile=True)
   for _ in range(3):k=m(f,bbox)
   print(name,'shape',k.shape,'range',k.min(0),k.max(0),'ms',m.last_ms,flush=True)
   record=dict(model=name,shape=list(k.shape),latency_ms=m.last_ms,**m.engine.finish_profile())
   records.append(record)
   out=f.copy()
   for j,(x,y,c) in enumerate(k):
    if c>.1:
     cv2.circle(out,(int(x),int(y)),5,(0,255,0),-1);cv2.putText(out,str(j),(int(x),int(y)),0,.4,(0,0,255),1)
   (BASE/'results/smoke').mkdir(exist_ok=True)
   cv2.imwrite(str(BASE/'results/smoke'/f'{name}.jpg'),out)
  except Exception as e:
   import traceback;traceback.print_exc();records.append(dict(model=name,error=str(e)))
 (BASE/'results/gpu_smoke.json').write_text(json.dumps(records,indent=2))
