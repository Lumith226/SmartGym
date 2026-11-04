# Kết quả benchmark đầy đủ trên dữ liệu phù hợp

**Đã hoàn tất:** 10 checkpoint pretrained × 64 video của 8 người, gồm squat và chống đẩy ở bốn camera. Lấy mẫu 25 fps trong đoạn có nhãn rep và ngữ cảnh một giây hai đầu. Có 640 dòng đo, 202,200 frame–model, 20 biểu đồ và 64 video H.264 ghép 10 model trên toàn bộ đoạn đánh giá. Thử che khuất nhân tạo dùng 30 frame/clip trên cả 64 clip. Không fine-tune.

[Mở trình xem tương tác](pose_benchmark/results_full/index.html) · [Báo cáo](pose_benchmark/results_full/REPORT.md) · [Bảng 80 dòng theo bài/model/camera](pose_benchmark/results_full/comparison_camera_summary.csv) · [640 dòng chi tiết](pose_benchmark/results_full/comparison_by_exercise_camera.csv) · [Kiểm tra kết quả](pose_benchmark/results_full/VERIFICATION.json)

| Bài | PCK trung bình cao nhất | MAE đếm rep thấp nhất |
| --- | --- | --- |
| Squat | RTMO-s: 87.0% | YOLOv8n-Pose, YOLO26n-Pose, RTMPose-m, RTMO-s, ViTPose-B, HRNet, MoveNet-Lightning: 0.00 rep/clip |
| Chống đẩy | RTMPose-m: 53.4% | RTMO-s: 0.78 rep/clip |

PCK chấm vị trí 12 khớp chi theo ngưỡng 0,2 chiều dài thân chiếu. Xem khoảng bootstrap theo người trong [ANALYSIS.md](pose_benchmark/results_full/ANALYSIS.md), nhất là khi hai model gần nhau. Chưa có cơ sở kết luận một họ model tốt nhất ở mọi kích thước và điều kiện.

**GPU:** pose và detector dùng DirectML trên AMD Radeon RX 5600 XT. Classifier ST-GCN++ cố định chạy CPU như ứng dụng gốc trên máy này. FPS gồm pose và detector cần thiết, chưa tính giải mã/hiển thị/classifier.

**Giới hạn dữ liệu:** người dùng xác nhận chưa có nhãn lỗi, nên accuracy nhận diện lỗi vẫn là N/A. Có số liệu đồng thuận lớp qua camera. Chưa có góc gần 45°, góc ngang 90° hoặc thử thay độ cao có kiểm soát; che khuất nhân tạo được báo riêng. Xem [phạm vi và mức đáp ứng từng tiêu chí](pose_benchmark/results_full/dataset_audit/SCOPE.md).

![Squat](pose_benchmark/results_full/figures/squat_summary.png)

![Chống đẩy](pose_benchmark/results_full/figures/pushup_summary.png)

Tất cả môi trường, checkpoint, mã và đầu ra ở thư mục Fit3D_Pose_Benchmark. SmartGym gốc có git status sạch; mã và trọng số đối chiếu hash trùng bản sao dùng đánh giá. Fit3D chỉ được đọc. Bộ thử 16 clip cũ vẫn giữ nguyên trong `pose_benchmark/results/`; kết quả đầy đủ ở `pose_benchmark/results_full/`.

Chạy lại hoặc tiếp tục: `run_all.ps1`. Bảng mẫu nhãn lỗi để trống trong `results_full/form_annotation_template.csv`; cần người kiểm chứng trước khi dùng chấm accuracy.
