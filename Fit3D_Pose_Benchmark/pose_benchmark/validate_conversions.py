"""Check exported graph numerical agreement; this is not an accuracy benchmark."""
import json,os
from pathlib import Path
import cv2,numpy as np,onnxruntime as ort
from adapters import BASE,W,Engine,affine_crop,get_box

frame=cv2.imread(str(BASE/'sample.jpg'))
detector=Engine(W/'yolov8n.onnx');bbox=get_box(frame,detector)
records=[]
for name,file,size in [('LitePose','litepose.onnx',(448,448)),('Lite-HRNet','litehrnet_core.onnx',(192,256))]:
 if name=='LitePose':x=cv2.resize(frame,size).astype(np.float32).transpose(2,0,1)[None]
 else:
  f,c,s=affine_crop(frame,bbox,size)
  rgb=f[:,:,::-1].astype(np.float32);x=((rgb-[123.675,116.28,103.53])/[58.395,57.12,57.375]).transpose(2,0,1)[None].astype(np.float32)
 cpu=ort.InferenceSession(str(W/file),providers=['CPUExecutionProvider'])
 ref=cpu.run(None,{cpu.get_inputs()[0].name:np.ascontiguousarray(x)})
 gpu=Engine(W/file);actual=gpu.run(x)
 errors=[float(np.max(np.abs(a-b))) for a,b in zip(ref,actual)]
 records.append(dict(model=name,cpu_gpu_max_absolute_errors=errors,passed=max(errors)<.005))
 if name=='Lite-HRNet':
  original=ort.InferenceSession(str(W/'litehrnet.onnx'),providers=['CPUExecutionProvider'])
  raw=f.transpose(2,0,1)[None].astype(np.float32) # wrapper expects BGR pixel units
  expected=original.run(None,{original.get_inputs()[0].name:np.ascontiguousarray(raw)})[-1]
  err=float(np.max(np.abs(expected-ref[0])))
  records[-1]['wrapper_core_max_abs_error']=err;records[-1]['wrapper_core_passed']=err<.005
(BASE/'results/conversion_validation.json').write_text(json.dumps(records,indent=2))
print(json.dumps(records,indent=2))
