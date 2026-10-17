# SmartGym

Ứng dụng phân tích động tác từ video/webcam: lấy 17 khớp COCO, theo dõi
người tập, cắt rep và chấm động tác bằng ST-GCN++ ONNX.

Nhánh `codex/yolo-detect-rtmpose` cải thiện luồng nhận diện khớp và thêm
YOLO-Detect → RTMPose. Trọng số classifier giữ nguyên; chưa train lại.

## Khởi động

Python 3.12; chạy từ `smart_gym_camera_app`:

```bash
python -m venv .venv
# macOS/Linux: source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m tools.fetch_pose_models
python app.py --pose-backend yolo-detect-rtmpose --video test_videos_benchmark/squats/CORRECT_00002456.mp4 --exercise squat
```

Bỏ `--video` để dùng webcam. App chỉ nạp model cục bộ; công cụ cài kiểm
checksum. Model mới, video/cache/log sinh ra và `.venv` không đưa vào Git.

YOLO-Pose vẫn là mặc định khi bỏ `--pose-backend`. `rtmpose` là bí danh
của `yolo-detect-rtmpose`; `yolo-pose-rtmpose` giữ để đối chứng. YOLOX-m
đã được loại sau thử nghiệm; xem kết quả bên dưới.

## Tài liệu

- [Thiết kế nhận diện khớp](docs/POSE_PIPELINE.md): cấu trúc, thuật toán và cấu hình.
- [Kiểm định và lỗi còn lại](docs/POSE_VALIDATION.md): kết quả, lệnh kiểm tra và giới hạn.
- [Số liệu tổng hợp](docs/pose_validation_results.json): môi trường, checksum và kết quả đo.
- [Điều khiển ứng dụng và đọc log](smart_gym_camera_app/README.md).

Sau dọn: 84 unit test đạt; ba backend chạy lại 12 frame/backend cho đầu
ra trùng lượt đo trước. Các video hiện có là regression phát triển,
chưa có nhãn khớp chuẩn để công bố accuracy hoặc độ sẵn sàng thương mại.
