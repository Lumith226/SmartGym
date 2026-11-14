"""Label provenance, preprocessing, isolation, and missing-observation regressions."""
import json
from pathlib import Path
import sys
import numpy as np
import pytest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'smart_gym_test_rtmpose_v4'))
import highknees_schema
import buttkickers_schema
from running_rep_counter import RunningRepCounter


@pytest.mark.parametrize('schema,prefix,count',[
    (highknees_schema,'high knees',31),(buttkickers_schema,'buttkickers',14)])
def test_source_labels_retained_exactly_and_not_replaced_by_correct_class(schema,prefix,count):
    evidence=json.loads((ROOT/'doc/de_xuat_dong_tac_moi/du_lieu/kiem_ke_qualcomm.json').read_text(encoding='utf-8'))
    assert set(schema.RAW_LABELS)==set(evidence['target_labels'][prefix])
    assert len(schema.KEYS)==len(set(schema.KEYS))==count
    assert not any('march' in label or 'CORRECT' in label for label in schema.RAW_LABELS)


@pytest.mark.parametrize('schema',[highknees_schema,buttkickers_schema])
def test_missing_pose_abstains_and_normalization_is_finite(schema):
    raw=np.zeros((7,3,17),np.float32)
    skeleton,context,quality=schema.prepare_input(raw,4.)
    assert skeleton.shape==(3,192,17) and context.shape==(48,)
    assert np.isfinite(skeleton).all() and np.isfinite(context).all()
    assert not quality['usable']
    np.testing.assert_array_equal(raw,0)


def test_left_right_and_visibility_source_meanings_are_distinct():
    left=highknees_schema.encode_labels(['high knees - only left leg'])
    right=highknees_schema.encode_labels(['high knees - only right leg'])
    assert left.sum()==right.sum()==1 and not np.array_equal(left,right)
    item=next(r for r in buttkickers_schema.default_contract()['labels'] if r['suffix']=='feet disappear behind knees')
    assert item['kind']=='attribute'
    assert item['window_supported'] and not item['rep_supported']


@pytest.mark.parametrize('stem',['highknees','buttkickers'])
def test_all_development_splits_exclude_reserved_ids_and_content(stem):
    m=json.loads((ROOT/f'stgcn_squat_project/data/v4/manifest_{stem}_v4.json').read_text(encoding='utf-8'))
    rows={r['video']:r for r in m['records']}
    forbidden_hashes=set(m['benchmark_exclusion']['sha256'])
    forbidden_ids=set(m['benchmark_exclusion']['video_ids'])
    from squat_schema import video_id
    seen=set()
    for split,names in m['splits'].items():
        for name in names:
            row=rows[name]
            assert video_id(name) not in forbidden_ids
            assert row['sha256'] not in forbidden_hashes and row['sha256'] not in seen
            assert (row['source_split']=='test')==(split=='test')
            seen.add(row['sha256'])
    assert len(seen)==len(rows)


@pytest.mark.parametrize('exercise',['high_knees','butt_kickers'])
def test_static_or_unobserved_legs_do_not_create_repetitions(exercise):
    counter=RunningRepCounter()
    points=np.zeros((2,17),np.float32);confidence=np.ones(17,np.float32)
    points[1,[5,6]]=.2;points[1,[11,12]]=.6
    points[1,[13,14]]=.9;points[1,[15,16]]=1.2
    for i in range(80):counter.update(points,confidence,i/20,exercise)
    assert counter.count==0
    for i in range(80,100):counter.update(np.random.default_rng(i).normal(size=(2,17)),np.zeros(17),i/20,exercise)
    assert counter.count==0
    counter.reset();assert counter.count==0 and all(not h for h in counter.history)
