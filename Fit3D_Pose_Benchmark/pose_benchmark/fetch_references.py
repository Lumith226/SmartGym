import json,urllib.request
from pathlib import Path
BASE=Path(__file__).resolve().parent
OUT=BASE/'sources'
urls={
 'qai_litehrnet_model.py':'https://raw.githubusercontent.com/qualcomm/ai-hub-models/v0.65.0/src/qai_hub_models/models/litehrnet/model.py',
 'qai_litehrnet_app.py':'https://raw.githubusercontent.com/qualcomm/ai-hub-models/v0.65.0/src/qai_hub_models/models/litehrnet/app.py',
 'qai_hrnet_model.py':'https://raw.githubusercontent.com/qualcomm/ai-hub-models/v0.65.0/src/qai_hub_models/models/hrnet_pose/model.py',
 'qai_pose_app.py':'https://raw.githubusercontent.com/qualcomm/ai-hub-models/v0.65.0/src/qai_hub_models/models/_shared/pose/app.py',
 'litepose_mobilenet.py':'https://raw.githubusercontent.com/mit-han-lab/litepose/main/lib/models/pose_mobilenet.py',
 'dataset_util.py':'https://raw.githubusercontent.com/sminchisescu-research/imar_vision_datasets_tools/main/util/dataset_util.py',
 'rtmlib_body.py':'https://raw.githubusercontent.com/Tau-J/rtmlib/main/rtmlib/tools/solution/body.py',
 'rtmlib_rtmpose.py':'https://raw.githubusercontent.com/Tau-J/rtmlib/main/rtmlib/tools/pose_estimation/rtmpose.py',
 'rtmlib_vitpose.py':'https://raw.githubusercontent.com/Tau-J/rtmlib/main/rtmlib/tools/pose_estimation/vitpose.py',
 'litehrnet_card.md':'https://huggingface.co/qualcomm/LiteHRNet/raw/main/README.md',
 'hrnet_card.md':'https://huggingface.co/qualcomm/HRNetPose/raw/main/README.md',
 'litepose_readme.md':'https://raw.githubusercontent.com/mit-han-lab/litepose/main/README.md',
}
for name,url in urls.items():
 try:
  with urllib.request.urlopen(url,timeout=45) as r:data=r.read()
  (OUT/name).write_bytes(data)
  text=data.decode()
  if name=='dataset_util.py': print(text[:16000])
  else: print(name,'\n'.join(l for l in text.splitlines() if any(k in l for k in ['https://','http://','MODEL','onnx','pth','MODEL_PATH','26','25']))[:12000],flush=True)
 except Exception as e:print(name,e,flush=True)
for term in ['vitpose','litehrnet','hrnet','litepose']:
 try:
  with urllib.request.urlopen('https://huggingface.co/api/models?search='+term+'&limit=25') as r:d=json.load(r)
  print('HF',term,[x['id'] for x in d],flush=True)
 except Exception as e: print(e)
