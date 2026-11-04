"""Export original HRNet architecture with published FP32 pretrained weights."""
import hashlib,importlib.util,json,urllib.request
from pathlib import Path
import torch,yaml
from yacs.config import CfgNode
BASE=Path(__file__).resolve().parent;W=BASE/'weights';S=BASE/'sources'
urls={
 'hrnet_architecture.py':'https://raw.githubusercontent.com/leoxiaobin/deep-high-resolution-net.pytorch/master/lib/models/pose_hrnet.py',
 'hrnet_w32.yaml':'https://raw.githubusercontent.com/leoxiaobin/deep-high-resolution-net.pytorch/master/experiments/coco/hrnet/w32_256x192_adam_lr1e-3.yaml',
 'hrnet_w32_fp32.pth':'https://github.com/quic/aimet-model-zoo/releases/download/phase_2_march_artifacts/hrnet_posenet_FP32_state_dict.pth',
}
records=[]
for name,url in urls.items():
 p=(W if name.endswith('.pth') else S)/name
 if not p.exists():
  with urllib.request.urlopen(url,timeout=60) as response,p.with_suffix(p.suffix+'.partial').open('wb') as f:
   while chunk:=response.read(1024*1024):f.write(chunk)
  p.with_suffix(p.suffix+'.partial').replace(p)
 records.append(dict(path=str(p),url=url,sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
 print('Downloaded',name,p.stat().st_size,flush=True)
torch.set_num_threads(4)
spec=importlib.util.spec_from_file_location('hrnet_architecture',S/'hrnet_architecture.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
config=CfgNode(yaml.safe_load((S/'hrnet_w32.yaml').read_text()))
model=mod.get_pose_net(config,is_train=False)
state=torch.load(W/'hrnet_w32_fp32.pth',map_location='cpu',weights_only=True)
if 'state_dict' in state:state=state['state_dict']
state={k.removeprefix('module.'):v for k,v in state.items()}
model.load_state_dict(state,strict=True);model.eval()
torch.onnx.export(model,torch.zeros(1,3,256,192),str(W/'hrnet_w32.onnx'),opset_version=17,input_names=['image'],output_names=['heatmaps'],dynamo=False)
(BASE/'hrnet_export.json').write_text(json.dumps(records,indent=2))
print('HRNET EXPORTED',flush=True)
