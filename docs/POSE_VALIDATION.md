# Kiểm định nhận diện khớp

Cập nhật 17/10/2026. [Thiết kế](POSE_PIPELINE.md),
[số liệu có cấu trúc](pose_validation_results.json).
Các số frame đủ điều kiện dưới đây đo khả năng cung cấp đầu vào;
**chưa phải accuracy khớp hoặc độ chính xác chấm động tác**.

## Trạng thái bản bàn giao

- Sau dọn mã: **84/84 unit test đạt**. Chạy model thật 12 frame/backend
  cho ba backend còn giữ; 27 mảng khớp, mask, trạng thái, ID, box/candidate
  và offsets trùng chính xác với các frame tương ứng trong lượt đo trước.
- Smoke YOLO-Detect + RTMPose trước dọn: 420 lượt hiển thị, 413 cập nhật,
  397 frame đủ điều kiện, 10 reset, 5 lần gọi classifier. Đã đi qua
  EOF/replay, pause/resume, đổi video/bài tập, click và camera mô phỏng.
- GUI/input/camera được mock; model, classifier và ghi log chạy thật.
  Chưa kiểm tra webcam/giao diện vật lý, GPU hoặc CI trên GitHub.
- Trọng số classifier giữ nguyên. Bộ đếm/chấm form legacy chưa được
  sửa toàn bộ; thay pose vẫn cần đánh giá lại đầu ra classifier.

## So sánh detector/pose

Sáu clip, 896 frame/backend, CPU 2 luồng/runtime, warmup và xoay thứ tự
chạy theo frame. ROI tắt ở cả bốn. YOLOX là thử nghiệm đã kết thúc;
mã/trọng số YOLOX đã được rút khỏi bản bàn giao.

| Clip | Frame | YOLO-Pose | YOLO-Pose + RTM-m | YOLO Detect + RTM-m | YOLOX-m + RTM-m |
|---|---:|---:|---:|---:|---:|
| Squat CORRECT_00002456 | 149 | 93 | 105 | 109 | 96 |
| Squat BACK_ROUNDING_00001672 | 155 | 155 | 155 | 155 | 155 |
| Push-up HIP_ALIGNMENT_00135411 | 149 | 111 | 149 | 149 | 149 |
| Jumping jack CORRECT_00003013 | 147 | 79 | 67 | 13 | 80 |
| Crunch CORRECT_00085688 | 149 | 101 | 117 | 121 | 27 |
| Crunch NOT_RAISING_HIPS_00004206 | 147 | 140 | 142 | 138 | 144 |
| Tổng đủ điều kiện | 896 | 679 | 735 | 685 | 651 |

| Pipeline | Frame không có box người | Trung vị / P95 ms/frame |
|---|---:|---:|
| YOLO-Pose | 55 | 76.68 / 115.35 |
| YOLO-Pose + RTMPose-m | 55 | 127.20 / 212.10 |
| YOLOv8n Detect + RTMPose-m | 109 | 115.98 / 162.66 |
| YOLOX-m + RTMPose-m | 5 | 508.26 / 679.60 |

YOLOX giảm mất box ở jumping jack (103→4 frame so với YOLO Detect),
nhưng ở clip crunch đầu, diện tích box tăng 3.316 lần tại frame 27,
vượt gate liên kết 3.0. Tracking mất dấu rồi yêu cầu chọn lại từ frame 57,
dù candidate còn 17 khớp trên ngưỡng. Vì thế chưa chọn YOLOX; giữ
YOLO-Pose mặc định và hai luồng RTMPose để đối chứng.

Latency gồm detect/pose, chưa gồm decode, tracking, classifier, render
hay GUI. Ảnh nguồn chưa qua tăng sáng của app. Giữ tiền xử lý gốc:
Ultralytics có auto-letterbox chữ nhật, YOLOX cố định vuông 640; NMS
nhúng YOLOX 0.65 khác NMS 0.7 của Detect. Đây là so sánh pipeline thực
tế trên CPU dùng chung. Video phát ở FPS nguồn, không phải FPS inference.
Sáu cache/video đã được kiểm tra; 144 mảng không liên quan thời gian của
ba arm cũ trùng kết quả lần đo trước. Các clip là regression phát triển,
một số đã dùng chỉnh gate; không phải test độc lập để công bố accuracy.

Audit YOLO/tracking trước đó trên **80 video/11.999 frame** không lỗi
xử lý: 8.444 frame đủ điều kiện khi tắt ROI, 8.497 khi bật ROI; 576 retry,
96 lần nhận phục hồi, tăng 53 frame so với tắt ROI. So với tracking trước
đợt nâng cấp (8.585 frame), tổng vẫn giảm 88 vì quy tắc liên kết/dừng thay
đổi. Không gộp lượt này với phép so sánh sáu clip hoặc suy ra accuracy.

## Cách kiểm tra lại

Chạy từ `smart_gym_camera_app`; benchmark cần các model cục bộ đã cài:

```bash
python -m unittest test_pose_keypoints test_pose_tracking test_pose_detector test_pose_evaluation test_rtmpose tests.test_yolo_detect_rtmpose
python -m tools.benchmark_pose_backends --output artifacts/pose-comparison --max-frames 180 --render --no-roi-recovery
python -m tools.summarize_pose_benchmark --report artifacts/pose-comparison/report.json --verify-media --output artifacts/pose-comparison/summary.json
python -m tools.smoke_pose_app --pose-backend yolo-detect-rtmpose --output artifacts/app-smoke
python audit_pose_dataset.py --output artifacts/audit
```

Benchmark mặc định năm clip; truyền thêm nhiều `--video` để chọn đúng sáu
clip trong bảng. `--exercise` dùng cho video ngoài thư mục bài chuẩn.
NPZ giữ box/score, candidate, khớp/mask, trạng thái, ID và latency;
`report.json` ghi cấu hình, model hash và tổng hợp.

Để so trước/sau lọc và xuất mẫu gán nhãn:

```bash
python diagnose_pose.py --video /path/video.mp4 --exercise squat --output artifacts/review
python evaluate_pose_annotations.py artifacts/review/VIDEO/manual_review.csv --output artifacts/pck.json
```

`VIDEO` là thư mục con thực tế do lệnh chẩn đoán tạo. Mở ảnh
`source_frame_*.jpg`, điền `ground_truth_x_px`, `ground_truth_y_px`,
`visibility=visible` (hoặc `2`) và `review_notes` trong CSV. Mỗi frame
cần ít nhất một cặp vai-hông nhìn thấy để chuẩn hóa theo chiều dài thân.
PCK mặc định dùng 0.1 chiều dài tham chiếu; dự đoán thiếu vẫn nằm trong
mẫu số. Ngoại suy không tính là quan sát; không có nhãn thì không có
điểm accuracy. Đây chưa phải COCO OKS/mAP. Mẫu chẩn đoán thiên về frame
dịch chuyển lớn; muốn đo tổng quát phải lấy mẫu độc lập, có người kiểm tra.

## Lỗi và hạn chế còn theo dõi

| Vấn đề | Trạng thái |
|---|---|
| Sentinel `(0,0)`, dữ liệu không hữu hạn bị nhận là khớp thật | Đã vá và kiểm thử |
| Mất người khi chuyển động/góc khó, khớp tự tin nhưng sai | Còn; ROI không khôi phục được chi tiết bị che hoàn toàn |
| Chọn detection đầu tiên, mất lịch sử hoặc đổi nhầm người | Đã thêm liên kết/reset/click; giao nhau vẫn cần đánh giá danh tính |
| Lọc online lặp, trộn ngoại suy vào model input | Đã tách quan sát và bỏ lọc lặp online; legacy analyzer cần kiểm định |
| Tính góc trên x/w, y/h khi ảnh không vuông | Còn ở bộ đếm/chấm động tác, có thể làm lệch góc |
| Nhận góc camera từ khoảng cách vai/hông theo chiều rộng ảnh | Còn; phụ thuộc khoảng cách người tới camera |
| FSM đếm rep và thời lượng dùng số frame | Còn; tracking/lọc mới dùng timestamp |
| Classifier luôn chọn nhãn; nhánh mặc định CORRECT; chuẩn hóa lại score | Còn; cần abstain và hiệu chuẩn, chưa chứng minh là xác suất đúng |
| Benchmark legacy so nhãn bằng chuỗi và thiếu metadata ngoài repo | Còn; không dùng kết quả đó làm accuracy sản phẩm |
| Analyzer legacy ép chiều dài xương hoặc nội suy khớp | Cần kiểm định riêng, chưa thay toàn bộ preprocessing huấn luyện |
| Một nhãn/rep, nhãn gộp nhiều lỗi | Chưa hỗ trợ đánh giá nhiều lỗi đồng thời |
| COCO-17 thiếu chi tiết cột sống/thanh tạ | Chưa đủ căn cứ kết luận trực tiếp độ cong lưng/lệch thanh tạ |
| Chưa có nhãn khớp/danh tính, test độc lập và nguồn training đầy đủ | Chưa thể công bố mức tăng accuracy hoặc sẵn sàng thương mại |

Ưu tiên tiếp theo: nhãn box/khớp cho tư thế nằm, góc khó, che khuất và
nhiều người; đo PCK/OKS, false accept/reject và độ trễ trên thiết bị đích.
Đánh giá ảnh hưởng thay pose lên classifier trước khi đổi mặc định.

Raw video/cache và báo cáo lịch sử được giữ ngoài Git trong workspace
`diagnostics/`. Đường dẫn, checksum và môi trường nằm trong
[JSON tổng hợp](pose_validation_results.json). Các tài liệu cũ được lưu
tại `diagnostics/cleanup-20261017/documentation-history/`, không commit.
