# Sử dụng ứng dụng camera/video

Cài môi trường và model theo [README gốc](../README.md).
Chạy các lệnh dưới từ `smart_gym_camera_app`.

```bash
python app.py --pose-backend yolo-detect-rtmpose --video /path/video.mp4 --exercise squat
```

Bỏ `--video` để dùng webcam; phím V mở hộp thoại chọn video. Bấm chọn
đúng bài tập trước khi chấm; đổi backend/model bằng CLI khi khởi động.

| Phím/thao tác | Chức năng |
|---|---|
| V | Chọn file video |
| C | Chuyển sang camera |
| P / Space | Tạm dừng / tiếp tục |
| R | Phát lại và reset bộ đếm |
| M | Bật/tắt âm thanh nếu nền tảng hỗ trợ |
| Q / Esc | Thoát |
| 1 / 2 / 3 / 4 | Squat V2 / Push-up / Jumping jack / Reverse crunch |
| 5 / 6 / 7 | Squat V1 / Pull-up / Bench press |
| Click vào người | Chọn lại mục tiêu theo dõi |

Khi có `RESELECT_REQUIRED`, click người tập hoặc nhấn R. Mất dấu lâu
làm hủy rep dở; số rep đã hoàn thành chỉ được giữ khi ngắt lịch sử tự
động, không phải reset thủ công. Điểm xám là ngoại suy ngắn hạn để hiển
thị; không được dùng như khớp quan sát thật cho classifier.

## Nhật ký

Mỗi phiên tạo `logs/session_.../` với `summary.csv`, `details.jsonl`,
tensor từng rep và `pose_backend.json` ghi backend, ngưỡng, cấu hình và
SHA-256 tài nguyên. Dùng công cụ sẵn có để xem phiên:

```bash
python inspect_log.py
```

Dữ liệu log phản ánh đầu ra của hệ thống, chưa phải nhãn chuẩn đúng/sai.
Các thao tác GUI/camera đã kiểm bằng nguồn mô phỏng; cần thử camera thật
trên máy triển khai.

[Thiết kế và tham số](../docs/POSE_PIPELINE.md) ·
[Kiểm định, gán nhãn và các lỗi còn lại](../docs/POSE_VALIDATION.md).
