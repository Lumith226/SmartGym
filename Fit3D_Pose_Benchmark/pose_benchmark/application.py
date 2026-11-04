"""Use the existing SmartGym tracker and classifier unchanged as read-only imports."""
import contextlib,hashlib,io,sys,time
from pathlib import Path
import numpy as np
from adapters import BASE

sys.dont_write_bytecode=True
APP=BASE/'smartgym_reference'
sys.path.insert(0,str(APP))
from onnx_gym_analyzer import ONNXGymAnalyzer,EXERCISE_CONFIG
from rep_tracker import ExerciseRepTracker

class FixedAnalyzer(ONNXGymAnalyzer):
 def __init__(self):
  super().__init__()
  # Preserve the original app's CPU classifier configuration on this AMD
  # machine. Its existing ST-GCN++ graph crashes the DirectML process.
  # Pose estimators and the shared person detector still run on the GPU.
  self.providers=['CPUExecutionProvider']

def source_hashes():
 return {name:hashlib.sha256((APP/name).read_bytes()).hexdigest() for name in ['onnx_gym_analyzer.py','rep_tracker.py','enhanced_pose_processor.py']}

def assess(pred,ids,clip,size,analyzer):
 width,height=size;exercise='push_up' if clip['exercise']=='pushup' else 'squat'
 tracker=ExerciseRepTracker(analyzer);tracker.reset(exercise)
 events=[]; t=time.perf_counter()
 for frame_id,k in zip(ids,pred):
  # The source application processes a frame only when a person is detected.
  if not np.any(k[:,2]>0):continue
  coords=k.copy();coords[:,0]/=width;coords[:,1]/=height;coords[:,2]=np.clip(coords[:,2],0,1)
  info=tracker.process_frame(coords.T.astype(np.float32))
  if info['just_finished_rep']:
   events.append(dict(frame=int(frame_id),class_code=info['last_result']['class_code'],confidence=info['last_result']['confidence']))
 elapsed=(time.perf_counter()-t)*1000
 bounds=clip['rep_boundaries']
 lo,hi=bounds[0],bounds[-1]
 # Count only complete annotation intervals; do not assign labels to warmup.
 count=sum(lo<e['frame']<=hi for e in events)
 # Same GT interval boundaries for every pose model separate classification
 # consistency from differences caused by automatic rep segmentation.
 fixed=[]
 for a,b in zip(bounds[:-1],bounds[1:]):
  mask=(ids>=a)&(ids<=b)
  if mask.sum()<6:continue
  seq=[]
  for k in pred[mask]:
   q=k.copy();q[:,0]/=width;q[:,1]/=height;q[:,2]=np.clip(q[:,2],0,1);seq.append(q.T)
  tensor=analyzer.resample_sequence(seq)
  res=analyzer.predict_rep_tensor(tensor,exercise)
  fixed.append(dict(start=int(a),end=int(b),class_code=res['class_code'],confidence=res['confidence']))
 return dict(predicted_reps_in_annotated_window=count,gt_complete_intervals=len(bounds)-1,rep_absolute_error=abs(count-(len(bounds)-1)),rep_events=events,fixed_interval_predictions=fixed,tracker_classifier_ms_total=elapsed,form_accuracy=None,form_accuracy_reason='No matching SmartGym form labels in Fit3D; confidence is not accuracy')
