"""Các kiểm tra hồi quy có ý nghĩa cho hợp đồng đa nhãn và dữ liệu cô lập."""
import json
from pathlib import Path
import sys
import numpy as np
import pytest

APP=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(APP))
from squat_schema import LABELS, RAW_LABELS, encode_labels, prepare_input, default_contract, video_id, angle
from onnx_gym_analyzer import ONNXGymAnalyzer
from video_tools import compare_labels


def plausible_pose():
    seq=np.zeros((64,3,17),np.float32);seq[:,2]=.9
    seq[:,0]=np.linspace(.3,.7,17)
    seq[:,1]=np.linspace(.1,.9,17)
    return seq


def test_multilabel_keeps_mixed_annotations():
    raw=['squats - back not straight','squats - shallow','squats - shoulder-width']
    labels=encode_labels(raw)
    assert labels.sum()==3
    assert {RAW_LABELS[i] for i,v in enumerate(labels) if v}==set(raw)


def test_missing_pose_is_unknown_without_loading_model():
    analyzer=ONNXGymAnalyzer('cpu')
    result=analyzer.predict_squat_sequence(np.zeros((64,3,17),np.float32),3.)
    assert result['is_correct'] is None
    assert result['status']=='insufficient_data'
    assert len(result['label_results'])==14
    assert not result['detected_labels']


def test_postprocessing_can_return_all_labels_and_limits_rep_context():
    analyzer=ONNXGymAnalyzer('cpu')
    analyzer.load_squat_contract=lambda:default_contract()
    class Session:
        def get_inputs(self):return [object(),object()]
        def run(self,*args):return [np.full((1,14),3.,np.float32)]
    analyzer.get_session=lambda exercise:(Session(),'squat')
    whole=analyzer.predict_squat_sequence(plausible_pose(),3.,'video')
    assert len(whole['detected_labels'])==14
    assert whole['error_count']==3
    rep=analyzer.predict_squat_sequence(plausible_pose(),3.,'rep')
    assert len(rep['detected_labels'])==12
    assert not any(r['key']=='starting_late' for r in rep['detected_labels'])


def test_coexisting_attributes_are_preserved_but_not_called_correct():
    analyzer=ONNXGymAnalyzer('cpu');analyzer.load_squat_contract=lambda:default_contract()
    logits=np.full((1,14),-3.,np.float32);logits[0,[5,7,10]]=3.
    class Session:
        def get_inputs(self):return [object(),object()]
        def run(self,*args):return [logits]
    analyzer.get_session=lambda exercise:(Session(),'squat')
    result=analyzer.predict_squat_sequence(plausible_pose(),3.,'video')
    assert {'shoulder_width','narrow','no_obvious_issue'}=={r['key'] for r in result['detected_labels']}
    assert result['is_correct'] is None
    assert result['status']=='review_needed' and result['review_notes']


def test_geometry_preserves_aspect_and_mask():
    points=np.array([[100,100],[200,200],[300,100]],np.float32)/480
    assert float(angle(*points))==pytest.approx(90.)
    raw=plausible_pose();raw[:,:,0]=0
    x,c,q=prepare_input(raw,5.)
    assert x.shape==(3,64,17) and c.shape==(16,)
    assert np.all(x[:2,:,0]==0)
    assert np.isfinite(x).all() and np.isfinite(c).all()


def test_invalid_shapes_and_nan_rejected():
    with pytest.raises(ValueError):prepare_input(np.zeros((64,17,3)),3.)
    raw=plausible_pose();raw[0,0,0]=np.nan
    with pytest.raises(ValueError):prepare_input(raw,3.)


def test_comparison_requires_full_set_not_any_one_label():
    reference={'raw_labels':['squats - shallow','squats - back not straight']}
    result={'detected_labels':[{'raw_label':'squats - shallow'}]}
    comparison=compare_labels(result,reference)
    assert comparison['exact_match'] is False
    assert comparison['missed']==['squats - back not straight']


def test_manifest_is_disjoint_in_identity_and_content():
    path=APP.parent/'stgcn_squat_project/data/v4/manifest_squat_v4.json'
    manifest=json.loads(path.read_text(encoding='utf-8'))
    excluded=set(manifest['benchmark_exclusion']['video_ids'])
    splits=manifest['splits'];records={r['video']:r for r in manifest['records']}
    seen=set();digests=set()
    for videos in splits.values():
        assert not seen.intersection(videos)
        for v in videos:
            assert video_id(v) not in excluded
            assert records[v]['sha256'] not in digests
            digests.add(records[v]['sha256'])
        seen.update(videos)
    assert seen==set(records)


@pytest.mark.parametrize('keys,total_frames,expected_updates', [([ord('p'),32,ord('q')],3,2),([0,ord('q')],1,1)])
def test_app_pause_and_eof_do_not_repeat_processing(monkeypatch,tmp_path,keys,total_frames,expected_updates):
    import app
    path=tmp_path/'video.mp4';path.write_bytes(b'fake')
    updates=[];poses=[]
    class Analyzer:
        def __init__(self,*args):pass
        def normalize_exercise(self,x):return x
        def load_squat_contract(self):pass
    class Pose:
        def __init__(self,*args,**kwargs):pass
        def reset(self):pass
        def process_frame(self,frame):
            poses.append(frame.copy())
            return True,plausible_pose()[0]
    class Tracker:
        def __init__(self,*args):self.rep_count=0;self.state='READY'
        def reset(self,*args):pass
        def process_frame(self,*args,**kwargs):updates.append(1);return {}
    class Capture:
        def __init__(self,*args):self.index=0
        def isOpened(self):return True
        def read(self):
            self.index+=1
            return (True,np.zeros((50,80,3),np.uint8)) if self.index<=total_frames else (False,None)
        def get(self,*args):return 30.
        def release(self):pass
    monkeypatch.setattr(app,'ONNXGymAnalyzer',Analyzer)
    monkeypatch.setattr(app,'RTMPoseTracker',Pose)
    monkeypatch.setattr(app,'ExerciseRepTracker',Tracker)
    monkeypatch.setattr(app,'SessionLogger',lambda:object())
    monkeypatch.setattr(app,'analyze_squat_video',lambda *args,**kwargs:({'label_results':[]},None))
    monkeypatch.setattr(app,'print_result',lambda *args:None)
    monkeypatch.setattr(app,'render_dashboard',lambda frame,*args,**kwargs:frame)
    monkeypatch.setattr(app.cv2,'VideoCapture',Capture)
    for name in ['namedWindow','resizeWindow','imshow','destroyAllWindows','setMouseCallback']:
        monkeypatch.setattr(app.cv2,name,lambda *args,**kwargs:None)
    sequence=iter(keys);monkeypatch.setattr(app.cv2,'waitKey',lambda *args:next(sequence))
    monkeypatch.setattr(sys,'argv',['app.py','--video',str(path),'--device','cpu','--output',str(tmp_path/'analysis.json')])
    app.main()
    assert len(updates)==expected_updates
    assert len(poses)==expected_updates
    assert all(not frame.any() for frame in poses)
