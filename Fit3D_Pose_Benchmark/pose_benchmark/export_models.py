"""Convert pretrained models without fine-tuning, quantization or augmentation."""
import os,json,shutil,hashlib
from pathlib import Path
BASE=Path(__file__).resolve().parent; W=BASE/'weights'
os.environ['YOLO_CONFIG_DIR']=str(BASE/'.ultralytics')
os.environ['HF_HOME']=str(BASE/'.hf')
os.environ['TORCH_HOME']=str(BASE/'.torch')

def main():
 import torch
 torch.set_num_threads(4)
 from ultralytics import YOLO
 os.chdir(W)
 records=[]
 for name in ['yolov8n-pose','yolo11n-pose','yolo26n-pose','yolov8n']:
  target=W/(name+'.onnx')
  try:
   if not target.exists():
    source=BASE.parents[1]/'SmartGym/smart_gym_camera_app/weights'/f'{name}.pt'
    if source.exists() and not (W/(name+'.pt')).exists():shutil.copy2(source,W/(name+'.pt'))
    model=YOLO(name+'.pt')
    model.export(format='onnx',opset=17,simplify=False,dynamic=False,imgsz=640,device='cpu',half=False,nms=False)
   records.append({'model':name,'status':'exported','sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
   print(name,'OK',flush=True)
  except Exception as e:
   records.append({'model':name,'status':'failed','error':str(e)})
   print(name,repr(e),flush=True)
 try:
  if not (W/'litepose.onnx').exists():
   from openvino2onnx import convert
   import onnx
   shutil.copyfile(W/'litepose_xml.xml',W/'litepose.xml')
   shutil.copyfile(W/'litepose_bin.bin',W/'litepose.bin')
   m=convert(str(W/'litepose.xml'),target_opset=17,print_passes=False)
   onnx.save(m,W/'litepose.onnx')
  records.append({'model':'litepose','status':'converted'})
 except Exception as e:
  print('LitePose',repr(e),flush=True);records.append({'model':'litepose','status':'failed','error':str(e)})
 (BASE/'model_exports.json').write_text(json.dumps(records,indent=2))
if __name__=='__main__':main()
