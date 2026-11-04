"""Retrieve public model metadata and official Fit3D projection reference."""
import json, urllib.request
from pathlib import Path
BASE = Path(__file__).resolve().parent
OUT = BASE/'sources'
OUT.mkdir(exist_ok=True)
def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()
urls={
 'fit3d_tree.json':'https://api.github.com/repos/sminchisescu-research/imar_vision_datasets_tools/git/trees/main?recursive=1',
 'rtmlib_tree.json':'https://api.github.com/repos/Tau-J/rtmlib/git/trees/main?recursive=1',
 'litepose_tree.json':'https://api.github.com/repos/mit-han-lab/litepose/git/trees/main?recursive=1',
 'fit3d_notebook.json':'https://raw.githubusercontent.com/sminchisescu-research/imar_vision_datasets_tools/main/notebooks/visualize_lab_dataset.ipynb',
}
for name,url in urls.items():
    try:
        data=get(url); (OUT/name).write_bytes(data)
        if 'tree' in name:
            print(name,[x['path'] for x in json.loads(data).get('tree',[]) if any(k in x['path'].lower() for k in ['joints','camera','visual','body','hrnet','pose.py','vitpose','geometry'])][:60],flush=True)
        else:
            nb=json.loads(data)
            for c in nb['cells']:
                src=''.join(c['source'])
                if any(k in src for k in ['project','joints3d','camera_parameters']):print(src[:5000],flush=True)
    except Exception as e:print(name,str(e),flush=True)
for repo in ['qualcomm/LiteHRNet','qualcomm/HRNetPose','qualcomm/Movenet','onnx-community/vitpose-base','onnx-community/movenet-lightning-web','cansik/visiongraph']:
    try:
        d=json.loads(get('https://huggingface.co/api/models/'+repo)); (OUT/(repo.replace('/','_')+'.json')).write_text(json.dumps(d))
        print(repo,[(x['rfilename']) for x in d.get('siblings',[]) if any(k in x['rfilename'].lower() for k in ['onnx','litepose','readme'])][:35],flush=True)
    except Exception as e:print(repo,str(e),flush=True)
