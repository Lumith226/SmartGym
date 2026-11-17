"""Check cycle completeness and independent legs; no accuracy claims."""
from pathlib import Path
import sys
import numpy as np
import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scipy_rep_cutter import cut_reps,BufferedRepCutter


def poses(exercise,amplitude=1.,simultaneous=False):
    t=np.arange(0,8,1/24);k=np.zeros((len(t),3,17),np.float32);k[:,2]=1
    for side,s,h,n,a in [('left',5,11,13,15),('right',6,12,14,16)]:
        x=.3 if side=='left' else .7
        for j,y in [(s,.1),(h,.4),(n,.7),(a,1.)]:k[:,0,j]=x;k[:,1,j]=y
        centers=[2.,5.] if side=='left' or exercise=='situp' or simultaneous else [3.,6.]
        q=sum(np.maximum(0,1-np.abs(t-c)/.55) for c in centers)*amplitude
        if exercise=='situp':
            theta=q*np.pi*.65;k[:,0,n]=x+.3*np.sin(theta);k[:,1,n]=.4+.3*np.cos(theta)
        elif exercise=='high_knees':k[:,1,n]=.7-q*.5
        else:
            theta=q*np.pi*.75;k[:,0,a]=x+.3*np.sin(theta);k[:,1,a]=.7+.3*np.cos(theta)
    return k,t


@pytest.mark.parametrize('exercise',['situp','high_knees','butt_kickers'])
def test_complete_cycles_and_tiny_movement(exercise):
    k,t=poses(exercise);original=k.copy();events,_=cut_reps(k,t,exercise)
    assert len(events)==(2 if exercise=='situp' else 4)
    np.testing.assert_array_equal(k,original)
    assert all(e['start']<=e['core_start']<e['peak']<e['core_end']<=e['end'] for e in events)
    tiny,_=poses(exercise,.01);assert not cut_reps(tiny,t,exercise)[0]
    assert not cut_reps(k[t<2],t[t<2],exercise)[0]


@pytest.mark.parametrize('exercise',['high_knees','butt_kickers'])
def test_missing_leg_does_not_remove_other_leg(exercise):
    k,t=poses(exercise);k[:,2,[6,12,14,16]]=0
    events,_=cut_reps(k,t,exercise)
    assert len(events)==2 and all(e['side']=='left' for e in events)


@pytest.mark.parametrize('exercise',['high_knees','butt_kickers'])
def test_stream_deduplicates_per_leg_not_across_legs(exercise):
    k,t=poses(exercise,simultaneous=True);c=BufferedRepCutter(exercise);events=[]
    for p,ts in zip(k,t):events.extend(c.update(p,float(ts)))
    assert c.count==len(events)==4
    assert [e['side'] for e in events].count('left')==2
    assert [e['side'] for e in events].count('right')==2
    assert all(e['times'][-1]>=e['core_end'] for e in events)


@pytest.mark.parametrize('exercise',['situp','high_knees','butt_kickers'])
def test_tracker_routes_new_rep_models_without_legacy_filters(exercise):
    from rep_tracker import ExerciseRepTracker
    class Analyzer:
        frame_aspect_ratio=1.
        def normalize_exercise(self,key):return key
        def is_rep_model(self,key):return True
        def predict_squat_sequence(self,raw,duration,scope,_exercise):
            assert _exercise==exercise and scope=='rep' and raw.shape[1:]==(3,17)
            return dict(scope=scope,label_results=[],detected_labels=[])
    tracker=ExerciseRepTracker(Analyzer());tracker.reset(exercise)
    def forbidden(*args):raise AssertionError('Legacy filtering must not alter rep model input')
    tracker.smooth_kpts=forbidden
    k,t=poses(exercise,simultaneous=True);completed=[]
    for p,ts in zip(k,t):
        result=tracker.process_frame(p,timestamp=float(ts))
        if result['just_finished_rep']:completed.append(result)
    assert tracker.rep_count==(2 if exercise=='situp' else 4)
    assert completed and completed[-1]['rep_tensor_32'].shape==(3,64,17)
    assert sum(len(item['completed_reps']) for item in completed)==tracker.rep_count
