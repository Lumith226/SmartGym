"""Record exact evaluated artifacts, software versions and read-only inputs."""
import hashlib,importlib.metadata,json,os
import onnx
from pathlib import Path
from adapters import BASE,MODELS,W
from application import source_hashes,APP
from dataset import COCO,FIT

ORIGINS={
 'YOLOv8n-Pose':'https://github.com/ultralytics/assets/releases/download/v8.4.0/yolov8n-pose.pt',
 'YOLO11n-Pose':'https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo11n-pose.pt',
 'YOLO26n-Pose':'https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26n-pose.pt',
 'RTMPose-m':'https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/rtmpose-m_simcc-body7_pt-body7_420e-256x192-e48f03d0_20230504.zip',
 'RTMO-s':'https://download.openmmlab.com/mmpose/v1/projects/rtmo/onnx_sdk/rtmo-s_8xb32-600e_body7-640x640-dac2bf74_20231211.zip',
 'ViTPose-B':'https://huggingface.co/onnx-community/vitpose-base-simple',
 'HRNet':'https://github.com/quic/aimet-model-zoo/releases/download/phase_2_march_artifacts/hrnet_posenet_FP32_state_dict.pth',
 'Lite-HRNet':'https://huggingface.co/qualcomm/LiteHRNet',
 'MoveNet-Lightning':'https://huggingface.co/onnx-community/movenet-lightning-web',
 'LitePose-Auto-S':'https://huggingface.co/cansik/visiongraph',
}
rows=[]
for name,(filename,kind) in MODELS.items():
 p=W/filename
 graph=onnx.load(str(p),load_external_data=False)
 inputs=[dict(name=i.name,type=onnx.helper.printable_type(i.type)) for i in graph.graph.input]
 rows.append(dict(name=name,path=str(p),source=ORIGINS[name],sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size,inputs=inputs,adapter=kind,trained_or_finetuned_in_this_work=False,quantized_in_this_work=False))
 rows[-1]['evaluated_input_shape']=([1,192,192,4] if kind=='movenet' else [1,3,448,448] if kind=='litepose' else [1,3,640,640] if kind in ['yolo','rtmo'] else [1,3,256,192])
deps={p:importlib.metadata.version(p) for p in ['numpy','opencv-python','onnx','onnxruntime-directml','torch','ultralytics','rtmlib','matplotlib']}
fixed={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [APP/'weights/best_stgcnpp_squat_v2.onnx',APP/'weights/best_stgcnpp_pushup_v2.onnx']}
data=dict(models=rows,software=deps,smartgym_source_hashes=source_hashes(),fixed_classifier_hashes=fixed,conversion_notes={'Lite-HRNet':'Unchanged pretrained neural core extracted from the Qualcomm wrapper; host handles standard MMPose normalization/decoding. Numerical wrapper/core equivalence checked.','LitePose':'Community OpenVINO FP32 export converted to ONNX. Original folded BGR pixel preprocessing preserved. Single-person global heatmap peak decoding with two-stage heatmap averaging; no multi-person tag grouping.','HRNet':'Published FP32 checkpoint loaded strictly into original HRNet-W32 architecture, exported to ONNX.','ViTPose-B':'Community ONNX export of ViTPose-base-simple; not ViTPose++.'})
data['joint_mapping']={'COCO_indices':COCO.tolist(),'Fit3D_indices':FIT.tolist()}
detector=W/'yolov8n.onnx'
data['shared_detector']={'name':'YOLOv8n COCO person detector','path':str(detector),'sha256':hashlib.sha256(detector.read_bytes()).hexdigest(),'source':'Ultralytics pretrained yolov8n.pt exported to ONNX','selection':'largest-area person with score > 0.3; all top-down pose models use this same detector'}
data['benchmark_code_hashes']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(BASE.glob('*.py'))}
data['runner_hashes']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(BASE.parent.glob('*.ps1'))}
data['execution_notes']='Unaffected non-ViT preprocessing was checked against the archived adapter before the ViTPose-only UDP/DARK correction. ViTPose measurements were rerun. Speed measurements use the final adapters for every model. SmartGym control files were relocated as byte-identical frozen copies.'
R=Path(os.environ.get('POSE_BENCHMARK_RESULTS',str(BASE/'results')))
if R.name=='results_full':
 data['execution_notes']+=' The additional accuracy work used two disjoint model worker groups after building the common detector cache. Published latency/FPS was measured separately in one sequential worker after both accuracy processes exited.'
 data['pilot_lineage']='PILOT_LINEAGE.json preserves the original 160 audited measurements and code hashes.'
(R/'MODEL_PROVENANCE.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
lines=['# Checkpoint và cấu hình thực đo','',
 'Mỗi họ dùng đúng một checkpoint pretrained. Không fine-tune, không lượng tử hóa hoặc test-time augmentation trong benchmark này. Một số artifact là bản export ONNX/OpenVINO cộng đồng; không coi tất cả file ONNX là bản phát hành trực tiếp từ tác giả. Xem hash và ghi chú chuyển đổi trong MODEL_PROVENANCE.json.','',
 '| Model | Tensor khai báo trong graph | Shape thực dùng | Detector chung | File ONNX (MiB) | Nguồn |','| --- | --- | --- | --- | --- | --- |']
for r in rows:
 topdown=r['adapter'] in ['rtmpose','vitpose','qai_heatmap','heatmap','movenet']
 lines.append(f'| {r["name"]} | {"; ".join(i["type"] for i in r["inputs"])} | {" × ".join(map(str,r["evaluated_input_shape"]))} | {"YOLOv8n" if topdown else "Không cần"} | {r["bytes"]/1024**2:.1f} | [Checkpoint/export]({r["source"]}) |')
lines+=['','Dung lượng file không phải lượng VRAM sử dụng. Tensor FLOAT là FP32; đầu vào UINT8 của MoveNet là kiểu ảnh đầu vào, không có nghĩa các trọng số bị lượng tử hóa trong lượt thử. Tất cả preprocessing và decoder được ghi trong adapters.py.','']
(R/'MODEL_CONFIG.md').write_text('\n'.join(lines),encoding='utf-8')
print('Recorded',len(rows),'models')
