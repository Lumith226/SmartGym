"""A renamed benchmark must remain forbidden in every development split."""
import json
from pathlib import Path
import sys
import pytest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'stgcn_squat_project/train_pipeline'))
from audit_benchmark_isolation import audit_manifest
from prepare_squat_v4_dataset import sha256


@pytest.mark.parametrize('split',['train','validation','test'])
def test_renaming_benchmark_cannot_evade_content_exclusion(tmp_path,split):
    benchmark=tmp_path/'00000001.mp4'
    benchmark.write_bytes(b'benchmark video payload')
    renamed=tmp_path/'99999999.mp4'
    renamed.write_bytes(benchmark.read_bytes())
    digest=sha256(benchmark)
    row={'video':renamed.name,'path':str(renamed),'sha256':digest}
    splits={key:([renamed.name] if key==split else []) for key in ('train','validation','test')}
    manifest=tmp_path/'manifest.json'
    manifest.write_text(json.dumps({'records':[row],'splits':splits}),encoding='utf-8')
    report,_,_=audit_manifest(manifest,{'00000001'},{digest})
    assert report['record_inventory_overlap']==[renamed.name]
    assert report['splits'][split]['matches']==[{'video':renamed.name,'reasons':['benchmark_sha256']}]


def test_official_test_cannot_be_reassigned_to_train(tmp_path):
    video=tmp_path/'00000001.mp4';video.write_bytes(b'official test video')
    row={'video':video.name,'path':str(video),'sha256':sha256(video),'source_split':'test'}
    manifest=tmp_path/'manifest.json'
    manifest.write_text(json.dumps({'records':[row],'splits':{'train':[video.name],'validation':[],'test':[]}}),encoding='utf-8')
    with pytest.raises(ValueError,match='Official Qualcomm test crossed split boundary'):
        audit_manifest(manifest,set(),set())
