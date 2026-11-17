"""A usable rep must survive long unrelated/missing-pose parts of an upload."""
from pathlib import Path
import sys
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))


def test_long_video_checks_quality_per_rep_instead_of_rejecting_whole_video():
    from onnx_gym_analyzer import ONNXGymAnalyzer
    from squat_schema import default_contract
    from rep_skeleton import prepare_skeleton
    analyzer=ONNXGymAnalyzer('cpu');contract=default_contract()
    contract.update(input_scope='rep',requires_context=False,frames=64)
    for row in contract['labels']:row.update(rep_supported=True,calibrated=True,threshold=.5)
    analyzer.load_v4_contract=lambda _:contract;calls=[]
    class Session:
        def get_inputs(self):return [object()]
        def run(self,unused,feed):
            assert set(feed)=={'skeleton'} and feed['skeleton'].shape==(1,3,64,17)
            calls.append(feed['skeleton'])
            return [np.ones((1,14),np.float32)*3]
    analyzer.get_session=lambda ex:(Session(),ex)
    t=np.arange(0,100,.05);k=np.zeros((len(t),3,17),np.float32)
    mask=(t>=20)&(t<=25);movement=np.maximum(0,1-np.abs(t-22)/.8)
    k[mask,2]=1;k[mask,0]=.5
    for joint in [5,6]:k[mask,1,joint]=.3+movement[mask]*.2
    for joint in [11,12]:k[mask,1,joint]=.6+movement[mask]*.2
    assert not prepare_skeleton(k)[1]['usable']
    result=analyzer.predict_squat_sequence(k,float(t[-1]),scope='video',raw_times=t)
    assert result.get('rep_count',0)==1 and len(calls)==1
    assert result['rep_results'][0]['quality']['usable']
