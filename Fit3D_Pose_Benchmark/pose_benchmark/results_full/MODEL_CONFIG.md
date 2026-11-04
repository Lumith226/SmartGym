# Checkpoint và cấu hình thực đo

Mỗi họ dùng đúng một checkpoint pretrained. Không fine-tune, không lượng tử hóa hoặc test-time augmentation trong benchmark này. Một số artifact là bản export ONNX/OpenVINO cộng đồng; không coi tất cả file ONNX là bản phát hành trực tiếp từ tác giả. Xem hash và ghi chú chuyển đổi trong MODEL_PROVENANCE.json.

| Model | Tensor khai báo trong graph | Shape thực dùng | Detector chung | File ONNX (MiB) | Nguồn |
| --- | --- | --- | --- | --- | --- |
| YOLOv8n-Pose | FLOAT, 1x3x640x640 | 1 × 3 × 640 × 640 | Không cần | 12.9 | [Checkpoint/export](https://github.com/ultralytics/assets/releases/download/v8.4.0/yolov8n-pose.pt) |
| YOLO11n-Pose | FLOAT, 1x3x640x640 | 1 × 3 × 640 × 640 | Không cần | 11.3 | [Checkpoint/export](https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo11n-pose.pt) |
| YOLO26n-Pose | FLOAT, 1x3x640x640 | 1 × 3 × 640 × 640 | Không cần | 11.5 | [Checkpoint/export](https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26n-pose.pt) |
| RTMPose-m | FLOAT, batchx3x256x192 | 1 × 3 × 256 × 192 | YOLOv8n | 51.8 | [Checkpoint/export](https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/rtmpose-m_simcc-body7_pt-body7_420e-256x192-e48f03d0_20230504.zip) |
| RTMO-s | FLOAT, batchx3x640x640 | 1 × 3 × 640 × 640 | Không cần | 37.8 | [Checkpoint/export](https://download.openmmlab.com/mmpose/v1/projects/rtmo/onnx_sdk/rtmo-s_8xb32-600e_body7-640x640-dac2bf74_20231211.zip) |
| ViTPose-B | FLOAT, batch_sizexnum_channelsxheightxwidth | 1 × 3 × 256 × 192 | YOLOv8n | 328.0 | [Checkpoint/export](https://huggingface.co/onnx-community/vitpose-base-simple) |
| HRNet | FLOAT, 1x3x256x192 | 1 × 3 × 256 × 192 | YOLOv8n | 109.0 | [Checkpoint/export](https://github.com/quic/aimet-model-zoo/releases/download/phase_2_march_artifacts/hrnet_posenet_FP32_state_dict.pth) |
| Lite-HRNet | FLOAT, 1x3x256x192 | 1 × 3 × 256 × 192 | YOLOv8n | 7.7 | [Checkpoint/export](https://huggingface.co/qualcomm/LiteHRNet) |
| MoveNet-Lightning | UINT8, batch_sizex192x192x4 | 1 × 192 × 192 × 4 | YOLOv8n | 8.9 | [Checkpoint/export](https://huggingface.co/onnx-community/movenet-lightning-web) |
| LitePose-Auto-S | FLOAT, 1x3x448x448 | 1 × 3 × 448 × 448 | Không cần | 10.4 | [Checkpoint/export](https://huggingface.co/cansik/visiongraph) |

Dung lượng file không phải lượng VRAM sử dụng. Tensor FLOAT là FP32; đầu vào UINT8 của MoveNet là kiểu ảnh đầu vào, không có nghĩa các trọng số bị lượng tử hóa trong lượt thử. Tất cả preprocessing và decoder được ghi trong adapters.py.
