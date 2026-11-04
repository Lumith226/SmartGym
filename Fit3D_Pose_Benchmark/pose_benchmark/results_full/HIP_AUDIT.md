# Kiểm tra riêng khớp hông

Phân tích này không sửa GT, không hiệu chỉnh tọa độ model và không thay kết quả PCK 12 khớp chính. Cả hai hông vẫn nằm trong tiêu chí bắt buộc.

Trên nhiều model, PCK ở hông thấp hơn các khớp còn lại. Đã đối chiếu chuỗi xương 1→2→3 và 4→5→6 với [mã vẽ skeleton của tác giả](../sources/dataset_util.py), xem overlay và làm phép thử đối chứng đổi chỗ hai hông chỉ trong tính sai số chẩn đoán.

| Bài | Model | TB PCK 2 hông (%) | TB PCK 10 khớp còn lại (%) | Trung vị sai số hông / thang thân | Nếu đổi hai hông |
| --- | --- | --- | --- | --- | --- |
| squat | YOLOv8n-Pose | 46.0 | 87.6 | 0.205 | 0.587 |
| squat | YOLO11n-Pose | 48.1 | 87.6 | 0.200 | 0.579 |
| squat | YOLO26n-Pose | 41.4 | 91.6 | 0.214 | 0.580 |
| squat | RTMPose-m | 38.2 | 95.4 | 0.222 | 0.570 |
| squat | RTMO-s | 45.6 | 95.3 | 0.204 | 0.571 |
| squat | ViTPose-B | 42.9 | 95.8 | 0.212 | 0.579 |
| squat | HRNet | 45.3 | 95.4 | 0.206 | 0.573 |
| squat | Lite-HRNet | 46.0 | 92.4 | 0.204 | 0.570 |
| squat | MoveNet-Lightning | 45.2 | 91.0 | 0.206 | 0.574 |
| squat | LitePose-Auto-S | 36.5 | 77.2 | 0.246 | 0.542 |
| pushup | YOLOv8n-Pose | 25.4 | 32.5 | 0.338 | 0.891 |
| pushup | YOLO11n-Pose | 20.7 | 28.3 | 0.397 | 0.896 |
| pushup | YOLO26n-Pose | 22.3 | 36.5 | 0.346 | 0.887 |
| pushup | RTMPose-m | 10.2 | 62.0 | 0.356 | 0.949 |
| pushup | RTMO-s | 10.3 | 56.3 | 0.371 | 0.935 |
| pushup | ViTPose-B | 16.2 | 60.8 | 0.312 | 0.962 |
| pushup | HRNet | 15.8 | 58.9 | 0.331 | 0.943 |
| pushup | Lite-HRNet | 14.3 | 42.5 | 0.359 | 0.893 |
| pushup | MoveNet-Lightning | 10.4 | 50.7 | 0.396 | 0.910 |
| pushup | LitePose-Auto-S | 8.3 | 26.8 | 0.604 | 0.861 |

PCK theo nhóm là trung bình clip, có phạt mất khớp như bảng chính. Hai cột sai số trung vị chỉ dùng frame có đủ hai hông hợp lệ và nằm trong ảnh; đây là chẩn đoán hình học, không thay thế điểm số có phạt mất khớp.

## Đối chứng theo người với ViTPose-B

| Bài | Người | Hông trực tiếp | Hông đổi bên | Lệch tâm hông về phía chân / thang thân |
| --- | --- | --- | --- | --- |
| squat | s03 | 0.176 | 0.547 | 0.151 |
| squat | s04 | 0.114 | 0.465 | 0.089 |
| squat | s05 | 0.206 | 0.535 | 0.194 |
| squat | s07 | 0.292 | 0.651 | 0.268 |
| squat | s08 | 0.355 | 0.693 | 0.338 |
| squat | s09 | 0.306 | 0.656 | 0.268 |
| squat | s10 | 0.143 | 0.549 | 0.133 |
| squat | s11 | 0.233 | 0.610 | 0.208 |
| pushup | s03 | 0.279 | 1.035 | N/A: không phân tích hướng ở push-up |
| pushup | s04 | 0.270 | 0.804 | N/A: không phân tích hướng ở push-up |
| pushup | s05 | 0.352 | 1.052 | N/A: không phân tích hướng ở push-up |
| pushup | s07 | 0.271 | 1.039 | N/A: không phân tích hướng ở push-up |
| pushup | s08 | 0.415 | 1.160 | N/A: không phân tích hướng ở push-up |
| pushup | s09 | 0.325 | 0.991 | N/A: không phân tích hướng ở push-up |
| pushup | s10 | 0.325 | 0.876 | N/A: không phân tích hướng ở push-up |
| pushup | s11 | 0.303 | 0.977 | N/A: không phân tích hướng ở push-up |

Ở phép đối chứng ViTPose-B, đổi hai hông làm sai số tăng ở cả tám người cho cả hai bài. Trong squat, tâm hông dự đoán thường lệch về phía chân so với tâm hông MoCap chiếu 2D; mức lệch thay đổi theo người. Không thấy căn cứ để sửa bằng cách đổi chỉ số trái–phải.

**Giới hạn diễn giải:** chưa có nhãn khớp 2D thủ công để tách sai số mạng khỏi chênh lệch vị trí tham chiếu hoặc định nghĩa khớp giữa MoCap chiếu và annotation 2D mà model đã học. Vì vậy, PCK ở đây đo độ trùng với tham chiếu Fit3D đã nêu; không tự động chứng minh mọi điểm hông khác GT đều là lỗi kỹ thuật của người tập. Cũng không kết luận GT bị sai. Xem thêm sai số pixel, từng khớp và video.

![Ví dụ GT có số chỉ khớp và YOLOv8n-Pose](dataset_audit/full_sample_qc.jpg)

Ví dụ bốn clip squat: xanh lá là 25 điểm GT cùng chỉ số; hồng là dự đoán YOLOv8n-Pose. Chỉ dùng ảnh để kiểm tra tham chiếu, không làm đầu vào cho mạng.
