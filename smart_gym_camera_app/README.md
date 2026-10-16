# ỨNG DỤNG TEST CAMERA & TẢI VIDEO THỜI GIAN THỰC (SMART GYM APP)

Thư mục này là **dự án độc lập hoàn toàn**, tách biệt khỏi thư mục huấn luyện `stgcn_squat_project`.
Ứng dụng sử dụng **ONNX Runtime** để nạp trực tiếp các mô hình ST-GCN++ chuẩn `.onnx`, kết hợp với:
1. **Camera trực tiếp (Webcam)** hoặc **Tải file Video (.mp4, .avi, .mov)** từ máy tính.
2. **Thông báo trạng thái ngay sau mỗi rep** (Đúng chuẩn hay Cần sửa lỗi gì + âm thanh chuông thông báo).
3. **Ghi lại toàn bộ nhật ký tập luyện & mảng tọa độ 17 khớp** của từng rep vào file `.npy` và `.csv` để phục vụ nghiên cứu, kiểm tra và vẽ đồ thị sau này.

---

## 1. Cấu trúc thư mục:
```text
smart_gym_camera_app/
├── weights/
│   ├── best_stgcnpp_squat.onnx           # Mô hình ONNX Squat (4.36 MB)
│   ├── best_stgcnpp_push_up.onnx         # Mô hình ONNX Push-up (4.36 MB)
│   ├── best_stgcnpp_pull_up.onnx         # Mô hình ONNX Pull-up (4.36 MB)
│   ├── best_stgcnpp_bench_pressing.onnx  # Mô hình ONNX Bench Press (4.36 MB)
│   ├── best_stgcnpp_situp.onnx           # Mô hình ONNX Sit-up (4.36 MB)
│   ├── best_stgcnpp_jump_jack.onnx       # Mô hình ONNX Jumping Jack (4.36 MB)
│   └── yolov8n-pose.pt                   # YOLOv8-Pose trích xuất khung xương (6.5 MB)
├── logs/                                 # Thư mục lưu nhật ký & tọa độ khớp từng phiên tập
│   └── session_YYYYMMDD_HHMMSS/
│       ├── summary.csv                   # Bảng Excel tổng hợp các rep
│       ├── details.jsonl                 # Chi tiết đầy đủ xác suất và HLV feedback
│       └── tensors/                      # Mảng tọa độ 17 khớp (3, 32, 17) của từng rep
│           └── rep_001_squat_CORRECT_95pct.npy
├── onnx_gym_analyzer.py                  # Module suy luận thuần ONNX Runtime (CPU ~5ms)
├── rep_tracker.py                        # Bộ cắt rep thông minh & lọc nhiễu EMA
├── session_logger.py                     # Bộ tự động ghi log và xuất file tọa độ
├── inspect_log.py                        # Công cụ xem nhanh lịch sử và kiểm tra tọa độ
├── app.py                                # Giao diện đồ họa Webcam & Video thời gian thực
└── README.md                             # Hướng dẫn sử dụng
```

---

## 2. Cách khởi động và kiểm thử bằng Video:

### Cách 1: Chọn Video trực tiếp bằng hộp thoại đồ họa (Khuyên dùng)
Chạy ứng dụng:
```powershell
cd "d:\1.E22CQCN03-B\OneDrive - ptit.edu.vn\Y4\GYM\smart_gym_camera_app"
python app.py
```
- Khi cửa sổ hiện lên, bạn chỉ cần bấm phím **`V`**.
- Hộp thoại chọn file của Windows sẽ bật lên để bạn duyệt và chọn bất kỳ video bài tập nào (`.mp4`, `.avi`, `.mov`...).
- Bấm phím số **`1`** đến **`6`** tương ứng với bài tập trong video để AI nạp đúng mô hình chấm điểm!

### Cách 2: Khởi động thẳng bằng dòng lệnh kèm đường dẫn video
```powershell
python app.py --video "D:\duong\dan\toi\video_squat.mp4" --exercise squat
```

---

## 3. Bảng Phím Tắt Điều Khiển:

| Phím bấm | Chức năng |
| :---: | :--- |
| **`V`** | **Mở hộp thoại chọn file video từ máy tính (.mp4, .avi, .mov...)** |
| **`C`** | **Chuyển lại về chế độ Camera trực tiếp (Webcam)** |
| **`P`** hoặc **`SPACE`** | **Tạm dừng / Tiếp tục phát video** (hoặc đánh giá thủ công) |
| **`1`** đến **`6`** | Chuyển bài tập: `1:Squat`, `2:Push-up`, `3:Pull-up`, `4:Bench`, `5:Sit-up`, `6:Jump Jack` |
| **`M`** | Bật / Tắt âm thanh thông báo (Mute / Unmute) |
| **`R`** | **Phát lại video từ đầu** / Đặt lại số Reps về 0 |
| **`Q`** hoặc **`ESC`** | Thoát ứng dụng |

---

## 4. Cách kiểm tra lại nhật ký sau khi test video:

Chạy công cụ kiểm tra tự động:
```powershell
python inspect_log.py
```
Toàn bộ kết quả từng rep trong video, độ tin cậy và mảng tọa độ 17 khớp `.npy` đều được lưu lại đầy đủ trong `logs/`!
