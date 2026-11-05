"""Floor exercise label semantics and compatible train/inference preprocessing."""
from pathlib import Path
import json
import sys
import numpy as np
import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import pushup_schema
import crunch_schema


@pytest.mark.parametrize('schema,count',[(pushup_schema,21),(crunch_schema,19)],ids=['pushup','reverse_crunch'])
def test_floor_schemas_retain_all_source_labels(schema,count):
    root=Path(__file__).resolve().parents[2]
    mapping=json.loads((root/f'stgcn_model_training/data/v4/{"pushup" if schema is pushup_schema else "crunch"}_label_mapping.json').read_text(encoding='utf-8'))
    assert len(schema.LABELS)==count and len(set(schema.RAW_LABELS))==count
    assert set(mapping['original_descriptions'])==set(schema.RAW_LABELS)
    target=schema.encode_labels(schema.RAW_LABELS[:2])
    assert target.shape==(count,) and target.sum()==2


@pytest.mark.parametrize('schema',[pushup_schema,crunch_schema],ids=['pushup','reverse_crunch'])
def test_floor_features_are_finite_mirror_invariant_and_preserve_confidence(schema):
    rng=np.random.default_rng(13)
    raw=rng.uniform(.2,.8,(40,3,17)).astype(np.float32);raw[:,2]=.9
    indices=[0,2,1,4,3,6,5,8,7,10,9,12,11,14,13,16,15]
    mirrored=raw[:,:,indices].copy();mirrored[:,0]*=-1
    x,c,q=schema.prepare_input(raw,4)
    mx,mc,mq=schema.prepare_input(mirrored,4)
    assert x.shape==(3,128,17) and c.shape==(32,) and q['usable']
    np.testing.assert_allclose(c,mc,atol=1e-5)
    np.testing.assert_allclose(x[2],.9,atol=1e-6)
    _,empty,quality=schema.prepare_input(np.zeros_like(raw),4)
    assert not quality['usable'] and quality['valid_frame_ratio']==0 and np.isfinite(empty).all()


def test_floor_label_types_do_not_turn_attributes_into_medical_or_correctness_claims():
    push={r[0]:r for r in pushup_schema.LABELS}
    crunch={r[0]:r for r in crunch_schema.LABELS}
    assert push['too_deep'][4]=='error'
    assert crunch['head_up'][4]=='attribute' and crunch['frontal'][4]=='attribute'
    assert not crunch['fast'][5] and not push['early_stopping'][5]
    assert len([r for r in crunch_schema.LABELS if r[0].startswith('height_')])==5


def floor_tracker(exercise='push_up'):
    from rep_tracker import ExerciseRepTracker
    class Analyzer:
        frame_aspect_ratio=1.
        def __init__(self):self.predictions=[]
        def normalize_exercise(self,key):return key
        def resample_sequence(self,frames,target_frames):return np.zeros((1,3,target_frames,17),np.float32)
        def predict_rep_tensor(self,tensor,exercise_type):
            self.predictions.append(exercise_type)
            return {'class_code':'test'}
    analyzer=Analyzer();tracker=ExerciseRepTracker(analyzer);tracker.reset(exercise)
    return tracker,analyzer


def elbow_pose(degrees=110,side=0):
    p=np.zeros((3,17),np.float32)
    p[2]=0
    sh,el,wr=(5,7,9) if side==0 else (6,8,10)
    p[:2,sh]=[.3,.3];p[:2,el]=[.3,.5]
    theta=np.radians(degrees);p[:2,wr]=[.3+.2*np.sin(theta),.5-.2*np.cos(theta)]
    p[2,[sh,el,wr]]=.95
    return p


def test_pushup_uses_visible_arm_without_averaging_occluded_arm():
    tracker,analyzer=floor_tracker()
    for i,angle in enumerate([170]*5+[110]*14+[160]*4):
        tracker.process_frame(elbow_pose(angle),timestamp=i*.1)
    assert tracker.rep_count==1 and len(analyzer.predictions)==1
    assert tracker.floor_side==0


def test_occluded_floor_joints_timeout_without_finishing_rep():
    tracker,analyzer=floor_tracker()
    tracker.process_frame(elbow_pose(),timestamp=0.)
    assert tracker.state=='IN_REP'
    for i in range(1,8):
        info=tracker.process_frame(np.zeros((3,17),np.float32),timestamp=i*.2)
    assert info['need_full_body'] and tracker.state=='READY'
    assert tracker.rep_count==0 and not analyzer.predictions and not tracker.current_rep_frames


def test_switching_visible_side_cannot_finish_rep():
    tracker,analyzer=floor_tracker()
    for i in range(14):tracker.process_frame(elbow_pose(110,0),timestamp=i*.1)
    tracker.process_frame(elbow_pose(170,1),timestamp=1.5)
    assert tracker.rep_count==0 and not analyzer.predictions and tracker.floor_side==1


@pytest.mark.parametrize('exercise,schema,predict',[
    ('push_up',pushup_schema,'predict_pushup_sequence'),
    ('situp',crunch_schema,'predict_crunch_sequence')],ids=['pushup','reverse_crunch'])
def test_floor_inference_is_multilabel_and_masks_video_only_labels(monkeypatch,exercise,schema,predict):
    from onnx_gym_analyzer import ONNXGymAnalyzer
    analyzer=ONNXGymAnalyzer('cpu')
    contract=schema.default_contract()
    monkeypatch.setattr(analyzer,'load_v4_contract',lambda key:contract)
    class Session:
        def get_inputs(self):return [object(),object()]
        def run(self,*args):return [np.full((1,len(schema.LABELS)),3,np.float32)]
    monkeypatch.setattr(analyzer,'get_session',lambda key:(Session(),key))
    raw=np.ones((40,3,17),np.float32)*.5;raw[:,2]=.9
    result=getattr(analyzer,predict)(raw,4,scope='window')
    assert len(result['label_results'])==len(schema.LABELS)
    assert len(result['detected_labels'])>1
    for row in result['label_results']:
        assert row['detected']==row['rep_supported']
