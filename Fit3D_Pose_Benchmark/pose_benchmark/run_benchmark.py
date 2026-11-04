"""Resume-safe GPU benchmark of original pretrained pose models on Fit3D."""
import argparse,gc,hashlib,json,os,platform,sys,time,traceback
from pathlib import Path
import cv2,numpy as np
from adapters import BASE,W,MODELS,Engine,Pose,get_box
from dataset import clips,gt_for,read_frames
from metrics import evaluate
from application import FixedAnalyzer,assess,source_hashes

RESULTS=Path(os.environ.get('POSE_BENCHMARK_RESULTS',str(BASE/'results')))
CACHE=RESULTS/'predictions';CACHE.mkdir(parents=True,exist_ok=True)

def save_json(p,data):
 temp=p.with_suffix('.partial');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(p)

def signature(model,clip,stride):
 h=hashlib.sha256()
 for p in [BASE/'adapters.py',BASE/'dataset.py',BASE/'metrics.py',BASE/'application.py',W/MODELS[model][0]]:
  h.update(p.read_bytes())
 h.update(json.dumps([clip['id'],stride,clip['rep_boundaries'],'annotated_plus_50frames_v1']).encode())
 return h.hexdigest()

def select_frames(clip,stride):
 # Keep one second before/after annotated repetitions to initialize the
 # unchanged tracker, but score rep counts inside the annotation bounds.
 cap=cv2.VideoCapture(clip['video']);fps=cap.get(cv2.CAP_PROP_FPS)
 bounds=clip['rep_boundaries'];start=max(0,bounds[0]-50);end=bounds[-1]+50
 cap.set(cv2.CAP_PROP_POS_FRAMES,start)
 frames=[];ids=[];i=start
 while i<=end:
  ok,frame=cap.read()
  if not ok:break
  if i%stride==0:frames.append(frame);ids.append(i)
  i+=1
 cap.release();ids=np.asarray(ids)
 gt,valid=gt_for(clip,ids)
 return ids[valid],[f for f,v in zip(frames,valid) if v],gt,fps

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--subjects',nargs='+',default=['s03','s04']);parser.add_argument('--stride',type=int,default=2);parser.add_argument('--models',nargs='+');parser.add_argument('--preserve-manifest',action='store_true');args=parser.parse_args()
 selected=list(clips(args.subjects));names=args.models or list(MODELS)
 if not args.preserve_manifest:
  save_json(RESULTS/'run_manifest.json',dict(subjects=args.subjects,stride=args.stride,clips=selected,models=names,source_hashes=source_hashes(),pose_metric_scope='all sampled frames in annotation window plus one second context',rep_count_scope='complete annotation intervals only',temporal_sampling_hz=50/args.stride,precision='FP32; no TTA, fine-tuning or quantization',gpu='AMD Radeon RX 5600 XT; DirectML device 0',python=sys.version))
 analyzer=FixedAnalyzer();detector=Engine(W/'yolov8n.onnx')
 for name in names:
  print('MODEL',name,flush=True)
  try:model=Pose(name)
  except Exception as e:
   save_json(RESULTS/(name+'_failure.json'),dict(model=name,error=str(e)));traceback.print_exc();continue
  for clip in selected:
   path=CACHE/(name+'__'+clip['id']+'.npz');report=path.with_suffix('.json')
   sig=signature(name,clip,args.stride)
   if report.exists() and path.exists() and json.loads(report.read_text(encoding='utf-8')).get('signature')==sig:
    print('CACHED',name,clip['id'],flush=True);continue
   try:
    ids,frames,gt,fps=select_frames(clip,args.stride);height,width=frames[0].shape[:2]
    boxpath=CACHE/(clip['id']+f'__boxes_stride{args.stride}_warm.npz')
    if boxpath.exists():
     b=np.load(boxpath);assert np.array_equal(b['ids'],ids);boxes=b['boxes'];det_ms=b['latency_ms']
    else:
     boxes=[];det_ms=[]
     for _ in range(5):get_box(frames[0],detector)
     for frame in frames:
      t=time.perf_counter();bbox=get_box(frame,detector);det_ms.append((time.perf_counter()-t)*1000)
      boxes.append(np.full(4,np.nan) if bbox is None else bbox)
     boxes=np.array(boxes);det_ms=np.array(det_ms)
     np.savez_compressed(boxpath,ids=ids,boxes=boxes,latency_ms=det_ms)
    topdown=model.kind in ['rtmpose','vitpose','qai_heatmap','heatmap','movenet']
    bbox0=boxes[0] if np.isfinite(boxes[0]).all() else None
    for _ in range(5):model(frames[0],bbox0)
    preds=[];lat=[];neural=[]
    for frame,bbox in zip(frames,boxes):
     t=time.perf_counter();k=model(frame,bbox if np.isfinite(bbox).all() else None)
     preds.append(k);lat.append((time.perf_counter()-t)*1000);neural.append(model.inference_ms)
    pred=np.array(preds);lat=np.array(lat);neural=np.array(neural)
    pipeline=lat+det_ms if topdown else lat
    stats=evaluate(pred,gt,(width,height),ids)
    application=assess(pred,ids,clip,(width,height),analyzer)
    stats.update(dict(signature=sig,model=name,clip=clip,frame_count=len(ids),source_fps=fps,analysis_sampling_fps=fps/args.stride,image_size=[width,height],pose_latency_median_ms=float(np.median(lat)),neural_latency_median_ms=float(np.median(neural)),pipeline_latency_median_ms=float(np.median(pipeline)),pipeline_latency_p95_ms=float(np.percentile(pipeline,95)),pipeline_fps=float(1000/np.mean(pipeline)),pipeline_fps_scope='pose plus shared detector for top-down models; excludes disk decoding, rendering and classifier',application=application))
    np.savez_compressed(path,ids=ids,pred=pred,gt=gt,pose_ms=lat,neural_ms=neural,pipeline_ms=pipeline)
    save_json(report,stats)
    print('DONE',name,clip['id'],'frames',len(ids),'PCK',round(stats['pck_torso_020_pct'],1),'FPS',round(stats['pipeline_fps'],1),'reps',application['predicted_reps_in_annotated_window'],'/',application['gt_complete_intervals'],flush=True)
    del frames,pred;gc.collect()
   except Exception as e:
    traceback.print_exc();save_json(RESULTS/(name+'__'+clip['id']+'_failure.json'),dict(model=name,clip=clip['id'],error=str(e)))
  del model;gc.collect()
 print('BENCHMARK FINISHED',flush=True)

if __name__=='__main__':main()
