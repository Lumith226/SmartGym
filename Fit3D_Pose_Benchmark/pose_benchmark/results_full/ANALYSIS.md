# Phân tích theo người và camera

Các số tổng hợp là trung bình theo clip. Khoảng 95% bên dưới là bootstrap theo **người** (10.000 lần, seed 20261030): lấy mẫu lại người và giữ bốn camera đi cùng. Bốn góc quay cùng một chuyển động không được coi là bốn người độc lập. Với chỉ tám người, khoảng này vẫn chỉ mang tính thăm dò; dữ liệu đang được dùng để so sánh và chọn model, không phải kiểm định độc lập.

## Squat

![Khoảng bất định](figures/squat_uncertainty.png)

![Đồng thuận lớp qua camera](figures/squat_form_stability.png)

Đồng thuận là tỷ lệ camera theo lớp phổ biến nhất của cùng rep, rồi trung bình qua các rep. Đồng thuận có thể cao khi model luôn đoán một lớp; xem cả phân bố lớp bên phải. Chưa biết các dự đoán này đúng hay sai vì chưa có nhãn đối chiếu.

| Model | PCK TB [95%] | MAE rep [95%] | Clip đếm đúng số rep (%) |
| --- | --- | --- | --- |
| YOLOv8n-Pose | 80.70 [70.96, 89.35] | 0.00 [0.00, 0.00] | 100.0 |
| YOLO11n-Pose | 80.99 [71.35, 89.44] | 0.22 [0.06, 0.41] | 84.4 |
| YOLO26n-Pose | 83.24 [74.87, 90.81] | 0.00 [0.00, 0.00] | 100.0 |
| RTMPose-m | 85.86 [78.43, 92.07] | 0.00 [0.00, 0.00] | 100.0 |
| RTMO-s | 87.04 [79.13, 93.54] | 0.00 [0.00, 0.00] | 100.0 |
| ViTPose-B | 87.01 [79.69, 93.01] | 0.00 [0.00, 0.00] | 100.0 |
| HRNet | 87.03 [78.94, 93.42] | 0.00 [0.00, 0.00] | 100.0 |
| Lite-HRNet | 84.65 [76.53, 91.78] | 0.12 [0.00, 0.38] | 96.9 |
| MoveNet-Lightning | 83.33 [73.56, 91.70] | 0.00 [0.00, 0.00] | 100.0 |
| LitePose-Auto-S | 70.42 [61.37, 80.60] | 0.47 [0.16, 0.91] | 78.1 |

Chênh PCK ghép cặp giữa RTMO-s và HRNet: 0.01 điểm %, khoảng bootstrap [-0.54, 0.56]. Khoảng chứa 0; chưa có bằng chứng rõ để phân biệt hai model đứng đầu trong nhóm người này.

### Đúng mẫu bảng yêu cầu: từng model và camera

| Bài tập | Mô hình tìm khớp | Camera | Góc tương đối TB | Chất lượng khớp | Đếm lượt | Nhận diện lỗi | FPS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Squat | YOLOv8n-Pose | 50591643 | 151.3° | 81.3% | 0.00 MAE | N/A: chưa có nhãn | 50.9 |
| Squat | YOLOv8n-Pose | 58860488 | 159.5° | 83.6% | 0.00 MAE | N/A: chưa có nhãn | 50.4 |
| Squat | YOLOv8n-Pose | 60457274 | 27.1° | 78.7% | 0.00 MAE | N/A: chưa có nhãn | 52.0 |
| Squat | YOLOv8n-Pose | 65906101 | 18.6° | 79.3% | 0.00 MAE | N/A: chưa có nhãn | 51.6 |
| Squat | YOLO11n-Pose | 50591643 | 151.3° | 85.1% | 0.12 MAE | N/A: chưa có nhãn | 50.2 |
| Squat | YOLO11n-Pose | 58860488 | 159.5° | 84.4% | 0.00 MAE | N/A: chưa có nhãn | 48.1 |
| Squat | YOLO11n-Pose | 60457274 | 27.1° | 77.2% | 0.00 MAE | N/A: chưa có nhãn | 49.7 |
| Squat | YOLO11n-Pose | 65906101 | 18.6° | 77.3% | 0.75 MAE | N/A: chưa có nhãn | 50.5 |
| Squat | YOLO26n-Pose | 50591643 | 151.3° | 86.1% | 0.00 MAE | N/A: chưa có nhãn | 47.9 |
| Squat | YOLO26n-Pose | 58860488 | 159.5° | 82.3% | 0.00 MAE | N/A: chưa có nhãn | 48.0 |
| Squat | YOLO26n-Pose | 60457274 | 27.1° | 82.6% | 0.00 MAE | N/A: chưa có nhãn | 45.0 |
| Squat | YOLO26n-Pose | 65906101 | 18.6° | 82.0% | 0.00 MAE | N/A: chưa có nhãn | 48.0 |
| Squat | RTMPose-m | 50591643 | 151.3° | 87.2% | 0.00 MAE | N/A: chưa có nhãn | 29.4 |
| Squat | RTMPose-m | 58860488 | 159.5° | 88.8% | 0.00 MAE | N/A: chưa có nhãn | 28.8 |
| Squat | RTMPose-m | 60457274 | 27.1° | 83.9% | 0.00 MAE | N/A: chưa có nhãn | 29.5 |
| Squat | RTMPose-m | 65906101 | 18.6° | 83.4% | 0.00 MAE | N/A: chưa có nhãn | 29.7 |
| Squat | RTMO-s | 50591643 | 151.3° | 88.7% | 0.00 MAE | N/A: chưa có nhãn | 29.4 |
| Squat | RTMO-s | 58860488 | 159.5° | 88.7% | 0.00 MAE | N/A: chưa có nhãn | 32.9 |
| Squat | RTMO-s | 60457274 | 27.1° | 85.8% | 0.00 MAE | N/A: chưa có nhãn | 30.3 |
| Squat | RTMO-s | 65906101 | 18.6° | 85.0% | 0.00 MAE | N/A: chưa có nhãn | 30.6 |
| Squat | ViTPose-B | 50591643 | 151.3° | 89.6% | 0.00 MAE | N/A: chưa có nhãn | 19.4 |
| Squat | ViTPose-B | 58860488 | 159.5° | 91.1% | 0.00 MAE | N/A: chưa có nhãn | 19.5 |
| Squat | ViTPose-B | 60457274 | 27.1° | 84.0% | 0.00 MAE | N/A: chưa có nhãn | 19.5 |
| Squat | ViTPose-B | 65906101 | 18.6° | 83.4% | 0.00 MAE | N/A: chưa có nhãn | 19.3 |
| Squat | HRNet | 50591643 | 151.3° | 90.1% | 0.00 MAE | N/A: chưa có nhãn | 23.5 |
| Squat | HRNet | 58860488 | 159.5° | 89.8% | 0.00 MAE | N/A: chưa có nhãn | 24.6 |
| Squat | HRNet | 60457274 | 27.1° | 84.4% | 0.00 MAE | N/A: chưa có nhãn | 23.8 |
| Squat | HRNet | 65906101 | 18.6° | 83.8% | 0.00 MAE | N/A: chưa có nhãn | 23.0 |
| Squat | Lite-HRNet | 50591643 | 151.3° | 87.7% | 0.00 MAE | N/A: chưa có nhãn | 36.6 |
| Squat | Lite-HRNet | 58860488 | 159.5° | 85.8% | 0.50 MAE | N/A: chưa có nhãn | 36.1 |
| Squat | Lite-HRNet | 60457274 | 27.1° | 83.1% | 0.00 MAE | N/A: chưa có nhãn | 35.1 |
| Squat | Lite-HRNet | 65906101 | 18.6° | 82.1% | 0.00 MAE | N/A: chưa có nhãn | 35.6 |
| Squat | MoveNet-Lightning | 50591643 | 151.3° | 83.6% | 0.00 MAE | N/A: chưa có nhãn | 39.7 |
| Squat | MoveNet-Lightning | 58860488 | 159.5° | 83.9% | 0.00 MAE | N/A: chưa có nhãn | 40.8 |
| Squat | MoveNet-Lightning | 60457274 | 27.1° | 84.6% | 0.00 MAE | N/A: chưa có nhãn | 38.2 |
| Squat | MoveNet-Lightning | 65906101 | 18.6° | 81.3% | 0.00 MAE | N/A: chưa có nhãn | 39.5 |
| Squat | LitePose-Auto-S | 50591643 | 151.3° | 56.1% | 1.25 MAE | N/A: chưa có nhãn | 26.1 |
| Squat | LitePose-Auto-S | 58860488 | 159.5° | 68.4% | 0.62 MAE | N/A: chưa có nhãn | 25.5 |
| Squat | LitePose-Auto-S | 60457274 | 27.1° | 80.6% | 0.00 MAE | N/A: chưa có nhãn | 25.6 |
| Squat | LitePose-Auto-S | 65906101 | 18.6° | 76.6% | 0.00 MAE | N/A: chưa có nhãn | 26.3 |

### Độ nhạy ngưỡng và khác biệt giữa người

![Độ nhạy](figures/squat_thresholds.png)

![Theo người](figures/squat_subjects.png)

PCK thay đổi theo ngưỡng và độ thu ngắn thân chiếu. Đường cong dùng cùng một lưới GT và phạt đầu ra mất khớp; bảng chính giữ ngưỡng 0,2 để nhất quán. Không dùng GT để sửa tọa độ hoặc đổi trái–phải của dự đoán.

Bảng sau chỉ giữ những frame mà detector chung tìm được bbox, áp dụng cùng mặt nạ frame cho cả 10 model. Bảng này giúp tách bớt ảnh hưởng mất detector nhưng có thiên lệch về frame dễ; không thay thế kết quả toàn clip và không chứng minh model pose độc lập tốt hơn.

| Model | PCK@0.2 khi detector chung có bbox (%) |
| --- | --- |
| YOLOv8n-Pose | 80.7 |
| YOLO11n-Pose | 81.0 |
| YOLO26n-Pose | 83.2 |
| RTMPose-m | 85.9 |
| RTMO-s | 87.0 |
| ViTPose-B | 87.0 |
| HRNet | 87.0 |
| Lite-HRNet | 84.7 |
| MoveNet-Lightning | 83.3 |
| LitePose-Auto-S | 70.4 |

## Push-up

![Khoảng bất định](figures/pushup_uncertainty.png)

![Đồng thuận lớp qua camera](figures/pushup_form_stability.png)

Đồng thuận là tỷ lệ camera theo lớp phổ biến nhất của cùng rep, rồi trung bình qua các rep. Đồng thuận có thể cao khi model luôn đoán một lớp; xem cả phân bố lớp bên phải. Chưa biết các dự đoán này đúng hay sai vì chưa có nhãn đối chiếu.

| Model | PCK TB [95%] | MAE rep [95%] | Clip đếm đúng số rep (%) |
| --- | --- | --- | --- |
| YOLOv8n-Pose | 31.31 [26.77, 35.93] | 2.34 [1.41, 3.16] | 34.4 |
| YOLO11n-Pose | 27.03 [22.74, 31.78] | 2.88 [1.84, 4.03] | 21.9 |
| YOLO26n-Pose | 34.11 [28.36, 39.96] | 1.94 [1.28, 2.62] | 34.4 |
| RTMPose-m | 53.39 [47.78, 58.83] | 1.12 [0.59, 1.75] | 68.8 |
| RTMO-s | 48.62 [42.93, 54.30] | 0.78 [0.25, 1.31] | 71.9 |
| ViTPose-B | 53.36 [47.92, 58.30] | 1.44 [0.81, 2.00] | 53.1 |
| HRNet | 51.75 [46.44, 56.64] | 1.72 [0.94, 2.38] | 62.5 |
| Lite-HRNet | 37.81 [33.55, 42.08] | 2.41 [1.66, 3.19] | 28.1 |
| MoveNet-Lightning | 43.99 [38.97, 49.56] | 2.56 [1.66, 3.47] | 50.0 |
| LitePose-Auto-S | 23.74 [18.42, 29.44] | 3.69 [2.84, 4.56] | 9.4 |

Chênh PCK ghép cặp giữa RTMPose-m và ViTPose-B: 0.03 điểm %, khoảng bootstrap [-1.11, 1.21]. Khoảng chứa 0; chưa có bằng chứng rõ để phân biệt hai model đứng đầu trong nhóm người này.

### Đúng mẫu bảng yêu cầu: từng model và camera

| Bài tập | Mô hình tìm khớp | Camera | Góc tương đối TB | Chất lượng khớp | Đếm lượt | Nhận diện lỗi | FPS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Push-up | YOLOv8n-Pose | 50591643 | 158.1° | 29.5% | 3.88 MAE | N/A: chưa có nhãn | 50.1 |
| Push-up | YOLOv8n-Pose | 58860488 | 159.9° | 31.7% | 2.88 MAE | N/A: chưa có nhãn | 50.3 |
| Push-up | YOLOv8n-Pose | 60457274 | 28.7° | 35.0% | 1.25 MAE | N/A: chưa có nhãn | 50.1 |
| Push-up | YOLOv8n-Pose | 65906101 | 25.5° | 29.1% | 1.38 MAE | N/A: chưa có nhãn | 48.9 |
| Push-up | YOLO11n-Pose | 50591643 | 158.1° | 27.4% | 3.75 MAE | N/A: chưa có nhãn | 48.8 |
| Push-up | YOLO11n-Pose | 58860488 | 159.9° | 26.7% | 4.88 MAE | N/A: chưa có nhãn | 48.6 |
| Push-up | YOLO11n-Pose | 60457274 | 28.7° | 28.5% | 1.38 MAE | N/A: chưa có nhãn | 48.3 |
| Push-up | YOLO11n-Pose | 65906101 | 25.5° | 25.5% | 1.50 MAE | N/A: chưa có nhãn | 48.5 |
| Push-up | YOLO26n-Pose | 50591643 | 158.1° | 35.0% | 1.50 MAE | N/A: chưa có nhãn | 48.2 |
| Push-up | YOLO26n-Pose | 58860488 | 159.9° | 33.9% | 3.25 MAE | N/A: chưa có nhãn | 47.4 |
| Push-up | YOLO26n-Pose | 60457274 | 28.7° | 35.8% | 1.38 MAE | N/A: chưa có nhãn | 46.7 |
| Push-up | YOLO26n-Pose | 65906101 | 25.5° | 31.8% | 1.62 MAE | N/A: chưa có nhãn | 47.1 |
| Push-up | RTMPose-m | 50591643 | 158.1° | 54.0% | 3.12 MAE | N/A: chưa có nhãn | 29.1 |
| Push-up | RTMPose-m | 58860488 | 159.9° | 53.2% | 1.38 MAE | N/A: chưa có nhãn | 30.2 |
| Push-up | RTMPose-m | 60457274 | 28.7° | 52.8% | 0.00 MAE | N/A: chưa có nhãn | 30.1 |
| Push-up | RTMPose-m | 65906101 | 25.5° | 53.6% | 0.00 MAE | N/A: chưa có nhãn | 29.7 |
| Push-up | RTMO-s | 50591643 | 158.1° | 47.5% | 0.38 MAE | N/A: chưa có nhãn | 30.0 |
| Push-up | RTMO-s | 58860488 | 159.9° | 43.5% | 1.38 MAE | N/A: chưa có nhãn | 31.4 |
| Push-up | RTMO-s | 60457274 | 28.7° | 53.6% | 0.00 MAE | N/A: chưa có nhãn | 26.2 |
| Push-up | RTMO-s | 65906101 | 25.5° | 49.9% | 1.38 MAE | N/A: chưa có nhãn | 24.8 |
| Push-up | ViTPose-B | 50591643 | 158.1° | 57.5% | 2.50 MAE | N/A: chưa có nhãn | 19.9 |
| Push-up | ViTPose-B | 58860488 | 159.9° | 51.0% | 3.12 MAE | N/A: chưa có nhãn | 19.5 |
| Push-up | ViTPose-B | 60457274 | 28.7° | 53.2% | 0.00 MAE | N/A: chưa có nhãn | 21.7 |
| Push-up | ViTPose-B | 65906101 | 25.5° | 51.8% | 0.12 MAE | N/A: chưa có nhãn | 20.4 |
| Push-up | HRNet | 50591643 | 158.1° | 51.8% | 4.25 MAE | N/A: chưa có nhãn | 23.4 |
| Push-up | HRNet | 58860488 | 159.9° | 52.5% | 2.62 MAE | N/A: chưa có nhãn | 24.1 |
| Push-up | HRNet | 60457274 | 28.7° | 51.8% | 0.00 MAE | N/A: chưa có nhãn | 24.8 |
| Push-up | HRNet | 65906101 | 25.5° | 50.9% | 0.00 MAE | N/A: chưa có nhãn | 25.0 |
| Push-up | Lite-HRNet | 50591643 | 158.1° | 38.3% | 3.50 MAE | N/A: chưa có nhãn | 35.7 |
| Push-up | Lite-HRNet | 58860488 | 159.9° | 40.7% | 3.50 MAE | N/A: chưa có nhãn | 37.3 |
| Push-up | Lite-HRNet | 60457274 | 28.7° | 37.5% | 0.75 MAE | N/A: chưa có nhãn | 35.7 |
| Push-up | Lite-HRNet | 65906101 | 25.5° | 34.8% | 1.88 MAE | N/A: chưa có nhãn | 36.0 |
| Push-up | MoveNet-Lightning | 50591643 | 158.1° | 33.2% | 4.88 MAE | N/A: chưa có nhãn | 39.5 |
| Push-up | MoveNet-Lightning | 58860488 | 159.9° | 36.7% | 5.38 MAE | N/A: chưa có nhãn | 39.2 |
| Push-up | MoveNet-Lightning | 60457274 | 28.7° | 53.5% | 0.00 MAE | N/A: chưa có nhãn | 40.2 |
| Push-up | MoveNet-Lightning | 65906101 | 25.5° | 52.4% | 0.00 MAE | N/A: chưa có nhãn | 41.0 |
| Push-up | LitePose-Auto-S | 50591643 | 158.1° | 15.8% | 5.25 MAE | N/A: chưa có nhãn | 25.6 |
| Push-up | LitePose-Auto-S | 58860488 | 159.9° | 23.4% | 2.62 MAE | N/A: chưa có nhãn | 25.5 |
| Push-up | LitePose-Auto-S | 60457274 | 28.7° | 34.9% | 3.12 MAE | N/A: chưa có nhãn | 25.7 |
| Push-up | LitePose-Auto-S | 65906101 | 25.5° | 20.9% | 3.75 MAE | N/A: chưa có nhãn | 25.6 |

### Độ nhạy ngưỡng và khác biệt giữa người

![Độ nhạy](figures/pushup_thresholds.png)

![Theo người](figures/pushup_subjects.png)

PCK thay đổi theo ngưỡng và độ thu ngắn thân chiếu. Đường cong dùng cùng một lưới GT và phạt đầu ra mất khớp; bảng chính giữ ngưỡng 0,2 để nhất quán. Không dùng GT để sửa tọa độ hoặc đổi trái–phải của dự đoán.

Bảng sau chỉ giữ những frame mà detector chung tìm được bbox, áp dụng cùng mặt nạ frame cho cả 10 model. Bảng này giúp tách bớt ảnh hưởng mất detector nhưng có thiên lệch về frame dễ; không thay thế kết quả toàn clip và không chứng minh model pose độc lập tốt hơn.

| Model | PCK@0.2 khi detector chung có bbox (%) |
| --- | --- |
| YOLOv8n-Pose | 31.4 |
| YOLO11n-Pose | 27.1 |
| YOLO26n-Pose | 34.2 |
| RTMPose-m | 56.5 |
| RTMO-s | 48.6 |
| ViTPose-B | 56.4 |
| HRNet | 54.7 |
| Lite-HRNet | 39.9 |
| MoveNet-Lightning | 47.1 |
| LitePose-Auto-S | 24.0 |
