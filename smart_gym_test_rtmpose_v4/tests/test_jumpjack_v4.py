"""Regression checks for 29-label jumping jacks and time-aware preprocessing."""
import json
from pathlib import Path
import sys
import numpy as np
import pytest

APP=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(APP))
import jumpjack_schema as schema
from onnx_gym_analyzer import ONNXGymAnalyzer


def moving_pose(duration=10.):
    seq=np.zeros((128,3,17),np.float32)
    seq[:,2]=.9
    seq[:,0]=np.linspace(.3,.7,17)
    seq[:,1]=np.linspace(.1,.9,17)
    phase=2*np.pi*np.linspace(0,duration,128)
    seq[:,1,9]=.3+.15*np.sin(phase)
    seq[:,1,10]=.3+.15*np.sin(phase)
    return seq


def test_original_schema_coverage_and_multiple_labels():
    manifest=json.loads((APP.parent/'stgcn_squat_project/data/v4/manifest_jumpjack_v4.json').read_text(encoding='utf-8'))
    assert len(schema.RAW_LABELS)==29
    assert set(manifest['label_counts'])==set(schema.RAW_LABELS)
    labels=['jumping jacks - only arms','jumping jacks - not jumping','jumping jacks - arms_rom=2.0']
    y=schema.encode_labels(labels)
    assert y.sum()==3
    assert {schema.RAW_LABELS[i] for i in np.flatnonzero(y)}==set(labels)


def test_timing_features_preserve_frequency_in_seconds():
    x,c,q=schema.prepare_input(moving_pose(),10.)
    assert x.shape==(3,128,17) and c.shape==(32,) and q['usable']
    assert np.isfinite(x).all() and np.isfinite(c).all()
    assert c[26]==pytest.approx(1.,abs=.12)
    _,fast,_=schema.prepare_input(moving_pose(),5.)
    assert fast[26]>c[26]*1.7


def test_unknown_pose_never_claims_correctness():
    result=ONNXGymAnalyzer('cpu').predict_jumpjack_sequence(np.zeros((128,3,17),np.float32),10.)
    assert result['status']=='insufficient_data' and result['is_correct'] is None
    assert len(result['label_results'])==29 and not result['detected_labels']


def test_opposite_phase_sign_and_mirroring_are_preserved():
    raw=moving_pose()
    wave=np.sin(2*np.pi*np.linspace(0,10,128))
    raw[:,0,15]=.5-.1*(1+wave)
    raw[:,0,16]=.5+.1*(1+wave)
    _,context,_=schema.prepare_input(raw,10.)
    assert context[24]<-.9  # Arms open while legs close: retain signed correlation.
    order=[0,2,1,4,3,6,5,8,7,10,9,12,11,14,13,16,15]
    mirrored=raw[:,:,order].copy();mirrored[:,0]*=-1
    _,flipped,_=schema.prepare_input(mirrored,10.)
    np.testing.assert_allclose(context,flipped,atol=1e-5)


def test_multi_label_predictions_and_video_only_context():
    analyzer=ONNXGymAnalyzer('cpu')
    analyzer.load_jumpjack_contract=lambda:schema.default_contract()
    class Session:
        def get_inputs(self):return [object(),object()]
        def run(self,*args):return [np.full((1,29),3.,np.float32)]
    analyzer.get_session=lambda ex:(Session(),ex)
    whole=analyzer.predict_jumpjack_sequence(moving_pose(),10.,scope='video')
    assert len(whole['detected_labels'])==29
    assert whole['error_count']==6 and whole['is_correct'] is False
    rep=analyzer.predict_jumpjack_sequence(moving_pose(),1.,scope='rep')
    assert len(rep['detected_labels'])==20
    assert all(r['rep_supported'] for r in rep['detected_labels'])


@pytest.mark.parametrize('exercise',['squat','jumpjack'])
def test_official_test_and_benchmark_are_disjoint(exercise):
    path=APP.parent/f'stgcn_squat_project/data/v4/manifest_{exercise}_v4.json'
    manifest=json.loads(path.read_text(encoding='utf-8'))
    records={r['video']:r for r in manifest['records']}
    ids=set(manifest['benchmark_exclusion']['video_ids'])
    forbidden_hashes=set(manifest['benchmark_exclusion']['sha256'])
    seen=set()
    for split,names in manifest['splits'].items():
        for name in names:
            row=records[name]
            assert schema.video_id(name) not in ids and row['sha256'] not in forbidden_hashes
            assert (row['source_split']=='test')==(split=='test')
            assert row['sha256'] not in seen
            seen.add(row['sha256'])
    assert len(seen)==len(records)
