"""Measure live sequential pipeline latency on 30 common frames per clip.

Batch 1, warmed networks; decoding/display excluded. Top-down detector runs
inside the timed region on every frame. Run after accuracy jobs finish.
"""
import gc,hashlib,json,os,time
from pathlib import Path
import cv2,numpy as np
from adapters import BASE,W,Engine,Pose,get_box
R=Path(os.environ.get('POSE_BENCHMARK_RESULTS',str(BASE/'results')))

def frames_at(video,ids):
 cap=cv2.VideoCapture(video);current=int(ids[0]);cap.set(cv2.CAP_PROP_POS_FRAMES,current)
 for target in ids:
  while current<int(target):cap.grab();current+=1
  ok,frame=cap.read();current+=1
  if not ok:raise RuntimeError(f'Missing source frame {target}')
  yield frame
 cap.release()

def probe_frames(clip,ids):
 """Read identical lossless BGR arrays; file I/O is outside timed inference."""
 cache=R/'speed_frame_cache';cache.mkdir(exist_ok=True)
 path=cache/(clip['id']+'.npy');meta=path.with_suffix('.json');source=Path(clip['video']);st=source.stat()
 key=dict(frame_ids=ids.tolist(),source=str(source),source_bytes=st.st_size,source_mtime_ns=st.st_mtime_ns,opencv=cv2.__version__,encoding='lossless original decoded BGR uint8 arrays')
 if not path.exists() or not meta.exists() or json.loads(meta.read_text())!=key:
  frames=list(frames_at(clip['video'],ids));array=np.stack(frames)
  temp=path.with_suffix('.partial')
  with temp.open('wb') as f:np.save(f,array,allow_pickle=False)
  temp.replace(path);meta.write_text(json.dumps(key,indent=2));del frames,array
 data=np.load(path,mmap_mode='r',allow_pickle=False)
 assert data.dtype==np.uint8 and data.shape[0]==len(ids) and data.shape[-1]==3
 for f in data:
  # Touch/copy each source array before the caller starts the timer; page
  # faults and storage latency must not become model inference latency.
  yield np.array(f,copy=True)

def main():
 manifest=json.loads((R/'run_manifest.json').read_text());records=[]
 protocol=hashlib.sha256((BASE/'adapters.py').read_bytes()+(BASE/'run_speed.py').read_bytes()+(R/'run_manifest.json').read_bytes()+b'live_probe30_batch1_warm5_v1').hexdigest()
 meta_path=R/'speed_run_metadata.json'
 if meta_path.exists() and json.loads(meta_path.read_text()).get('protocol_signature')==protocol and (R/'speed_results.json').exists():
  records=json.loads((R/'speed_results.json').read_text())
 done={(r['model'],r['clip_id']) for r in records}
 meta_path.write_text(json.dumps(dict(protocol_signature=protocol,scope='Pose plus live detector for top-down; no decode/render/classifier; 30 common frames per clip; batch 1; five warmups',gpu='AMD Radeon RX 5600 XT; DirectML device 0',expected_rows=len(manifest['models'])*len(manifest['clips']),status='running'),indent=2))
 detector=Engine(W/'yolov8n.onnx')
 for name in manifest['models']:
  model=Pose(name);topdown=model.kind in ['rtmpose','vitpose','heatmap','qai_heatmap','movenet']
  for clip in manifest['clips']:
   if (name,clip['id']) in done:
    print('SPEED CACHED',name,clip['id'],flush=True);continue
   data=np.load(R/'predictions'/(name+'__'+clip['id']+'.npz'))
   allids=data['ids'];ids=allids[np.unique(np.linspace(0,len(allids)-1,30,dtype=int))]
   durations=[];neural=[];detector_ms=[];missing=0
   for i,frame in enumerate(probe_frames(clip,ids)):
    if i==0:
     for _ in range(5):
      box=get_box(frame,detector) if topdown else None;model(frame,box)
    start=time.perf_counter()
    box=get_box(frame,detector) if topdown else None
    after_det=time.perf_counter();model(frame,box);end=time.perf_counter()
    durations.append((end-start)*1000);detector_ms.append((after_det-start)*1000 if topdown else 0)
    if topdown and box is None:missing+=1;neural.append(0)
    else:neural.append(model.inference_ms)
   live_neural=[x for x in neural if x>0]
   row=dict(model=name,clip_id=clip['id'],frame_ids=ids.tolist(),frames=len(ids),pipeline_fps=1000/float(np.mean(durations)),pipeline_median_ms=float(np.median(durations)),pipeline_p95_ms=float(np.percentile(durations,95)),neural_median_ms=float(np.median(live_neural)) if live_neural else None,detector_median_ms=float(np.median(detector_ms)),detector_missing_frames=missing,pipeline_ms=durations,neural_ms=neural)
   records.append(row)
   temp=R/'speed_results.partial';temp.write_text(json.dumps(records,indent=2));temp.replace(R/'speed_results.json')
   print('SPEED',name,clip['id'],round(row['pipeline_fps'],1),'fps',flush=True)
  del model;gc.collect()
 print('SPEED FINISHED',len(records),flush=True)
 meta=json.loads(meta_path.read_text());meta.update(status='complete',rows=len(records));meta_path.write_text(json.dumps(meta,indent=2))

if __name__=='__main__':main()
