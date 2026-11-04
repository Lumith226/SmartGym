"""Read-only Fit3D inventory; never print large coordinate arrays."""
import json
from pathlib import Path

ROOT = Path(r'E:\do an\fit3d')

def structure(obj, depth=0):
    if isinstance(obj, dict):
        return {k: structure(v, depth+1) for k,v in list(obj.items())[:8]}
    if isinstance(obj, list):
        return {'length':len(obj), 'first':structure(obj[0],depth+1) if obj else None}
    return obj

if __name__ == '__main__':
    subject = ROOT/'fit3d_train/train/s03'
    files = [subject/'rep_ann.json', subject/'joints3d_25/squat.json']
    files += list((subject/'camera_parameters').rglob('squat.json'))[:1]
    files += list((subject/'gpp').rglob('squat.json'))[:1]
    for p in files:
        print(p, p.stat().st_size)
        print(json.dumps(structure(json.loads(p.read_text())), indent=2)[:6000])
    print('Test example:')
    p = ROOT/'fit3d_test/test/s13/camera_parameters/squat.json'
    print(json.dumps(structure(json.loads(p.read_text())),indent=2)[:2500])
