"""Fail early if any expected measurement is missing or mismatched."""
import json
import numpy as np
from adapters import BASE

R=BASE/'results_full';m=json.loads((R/'run_manifest.json').read_text());frames={};count=0
assert len(m['models'])==10 and len(m['clips'])==64
for name in m['models']:
 for clip in m['clips']:
  p=R/'predictions'/(name+'__'+clip['id']+'.json');r=json.loads(p.read_text(encoding='utf-8'));d=np.load(p.with_suffix('.npz'))
  assert r['model']==name and r['clip']==clip
  assert d['pred'].shape==(len(d['ids']),17,3) and np.isfinite(d['pred']).all()
  assert np.isfinite(d['gt']).all() and d['gt'].shape==(len(d['ids']),25,2)
  assert np.all(np.diff(d['ids'])==m['stride']) and r['frame_count']==len(d['ids'])
  if clip['id'] not in frames:frames[clip['id']]=(d['ids'].copy(),d['gt'].copy())
  else:assert np.array_equal(d['ids'],frames[clip['id']][0]) and np.array_equal(d['gt'],frames[clip['id']][1])
  assert r['application']['form_accuracy'] is None
  count+=1
print('FULL MATRIX VERIFIED',count,'rows',sum(len(v[0]) for v in frames.values())*len(m['models']),'frame-models')
