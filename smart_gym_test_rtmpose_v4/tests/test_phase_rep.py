"""Synthetic invariants for phase arming and padding, not accuracy evidence."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import numpy as np
from unittest.mock import patch
from scipy_rep_cutter import cut_reps,BufferedRepCutter
from rep_skeleton import prepare_skeleton


def test_partial_first_excursion_is_not_accepted():
    t=np.arange(0,10,.05)
    y=sum(np.maximum(0,1-abs(t-c)/.7) for c in [.1,3,6])
    with patch('scipy_rep_cutter.movement_signal',return_value=(y,np.ones(len(t),bool))):
        events,_=cut_reps(np.zeros((len(t),3,17)),t,'squat')
    assert len(events)==2 and events[0]['peak']>2


def test_padding_stays_inside_observations():
    t=np.arange(0,8,.05);y=sum(np.maximum(0,1-abs(t-c)/.7) for c in [2,5])
    with patch('scipy_rep_cutter.movement_signal',return_value=(y,np.ones(len(t),bool))):
        events,_=cut_reps(np.zeros((len(t),3,17)),t,'squat')
    assert len(events)==2
    assert all(t[0]<=e['start']<=e['core_start']<e['peak']<e['core_end']<=e['end']<=t[-1] for e in events)


def test_skeleton_only_shape_and_missing_confidence():
    k=np.zeros((8,3,17),np.float32)
    x,q=prepare_skeleton(k)
    assert x.shape==(3,64,17) and np.isfinite(x).all() and not q['usable']


def test_stream_emits_completed_padded_cycles_once():
    t=np.arange(0,10,.05);k=np.zeros((len(t),3,17),np.float32);k[:,2]=1
    movement=sum(np.maximum(0,1-abs(t-c)/.7) for c in [2,5,8])
    k[:,0]=.5;k[:,1,5:7]=.3+movement[:,None]*.2;k[:,1,11:13]=.6+movement[:,None]*.2
    stream=BufferedRepCutter('squat');events=[]
    for ts,pose in zip(t,k):events.extend(stream.update(pose,float(ts)))
    assert len(events)==3 and stream.count==3
    assert all(e['start']<=e['core_start']<e['peak']<e['core_end']<=e['end'] for e in events)


def test_rep_tracker_uses_raw_sequence_and_new_model():
    from rep_tracker import ExerciseRepTracker
    class Analyzer:
        frame_aspect_ratio=1.
        def normalize_exercise(self,key):return key
        def is_rep_model(self,key):return key=='squat'
        def predict_squat_sequence(self,raw,duration,scope,_exercise):
            assert raw.shape[1:]==(3,17) and scope=='rep' and duration>0
            return dict(status='ok',detected_labels=[],is_multihead=True)
    tracker=ExerciseRepTracker(Analyzer());tracker.reset('squat')
    t=np.arange(0,5,.05);q=np.maximum(0,1-abs(t-2)/.7);finished=[]
    for ts,m in zip(t,q):
        k=np.zeros((3,17),np.float32);k[2]=1;k[0]=.5;k[1,5:7]=.3+m*.2;k[1,11:13]=.6+m*.2
        info=tracker.process_frame(k,timestamp=float(ts))
        if info['just_finished_rep']:finished.append(info)
    assert len(finished)==1 and finished[0]['rep_tensor_32'].shape==(3,64,17)


def test_new_model_receives_only_skeleton_and_keeps_multiple_labels():
    from onnx_gym_analyzer import ONNXGymAnalyzer
    from squat_schema import default_contract
    analyzer=ONNXGymAnalyzer('cpu');contract=default_contract()
    contract.update(input_scope='rep',requires_context=False,frames=64)
    for row in contract['labels']:row.update(rep_supported=True,calibrated=True,threshold=.5)
    analyzer.load_v4_contract=lambda ex:contract
    class Session:
        def get_inputs(self):return [object()]
        def run(self,unused,feed):
            assert set(feed)=={'skeleton'} and feed['skeleton'].shape==(1,3,64,17)
            return [np.ones((1,14),np.float32)*3]
    analyzer.get_session=lambda ex:(Session(),ex)
    k=np.zeros((20,3,17),np.float32);k[:,2]=.9
    k[:,0]=np.linspace(.2,.8,17);k[:,1]=np.linspace(.1,.9,17)
    result=analyzer.predict_squat_sequence(k,2.,scope='rep')
    assert len(result['detected_labels'])==14
    result=analyzer.predict_squat_sequence(k,2.,scope='window')
    assert result['status']=='waiting_for_rep'
