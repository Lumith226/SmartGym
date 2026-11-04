# So sánh 10 bộ tìm khớp trên Fit3D

**Phạm vi đo:** 64 video, 8 người (s03, s04, s05, s07, s08, s09, s10, s11), squat và push-up, mỗi bài 4 camera. Có 640 phép đo model–clip và 202,200 frame–model. Đã dùng toàn bộ video train có calibration, khớp 3D và bài trùng tên với SmartGym trong thư mục dữ liệu hiện có. Chỉ đánh giá các đoạn có nhãn rep và thêm một giây ngữ cảnh hai đầu. Lấy một frame mỗi hai frame nguồn: 50 → 25 fps. Không huấn luyện/fine-tune; đây không phải toàn bộ 47 bài Fit3D hoặc tập test ẩn.

**Thiết bị:** AMD Radeon RX 5600 XT, ONNX Runtime DirectML. Mạng pose và detector chạy GPU; CPU làm tiền/hậu xử lý. ST-GCN++ cố định chạy CPU như ứng dụng gốc trên máy AMD. GPU profiles nằm trong `profiles/`; một số graph có toán tử shape/giải mã chạy CPU.

**Giữ cố định:** tracker, bộ xử lý khớp và classifier ST-GCN++ V2 của SmartGym. Mỗi dòng pose dùng một checkpoint pretrained cụ thể, FP32, một lần suy luận, không flip/multi-scale TTA. Các model top-down dùng chung detector YOLOv8n; FPS pipeline của chúng tính cả chi phí detector. Kết quả chỉ áp dụng cho các cấu hình này, không xếp hạng mọi kích thước trong từng họ model.

**Chất lượng khớp:** PCK@0.2 = phần trăm 12 khớp chi có khoảng cách đến khớp Fit3D chiếu 2D không vượt quá 20% thang chuẩn thân. Thang chuẩn = max(20 pixel, khoảng cách giữa trung điểm hai vai và trung điểm hai hông sau khi chiếu lên ảnh); mức sàn tránh chia cho đoạn thân gần bằng 0 ở góc bị thu ngắn. Không dùng các điểm đầu có định nghĩa giải phẫu khác nhau. Khớp không dự đoán được bị tính sai. Jitter đo thay đổi của sai số dự đoán so với chuyển động chuẩn, theo bước lấy mẫu 1/25 giây. PCK dùng chiều dài thân chiếu nên góc gây thu ngắn thân có thể làm ngưỡng pixel chặt hơn; cần xem thêm sai số pixel và video.

**Đếm rep:** số chu kỳ hoàn chỉnh giữa marker đầu và cuối trong `rep_ann.json` (số khoảng liên tiếp = số marker − 1). Không ép chấm buffer cuối video. Sai số đếm là sai số tuyệt đối so với các khoảng nhãn đó.

**Nhận diện lỗi:** N/A về độ chính xác vì không có nhãn bốn lớp lỗi tương ứng SmartGym trong dữ liệu này. Chỉ báo thêm mức đồng thuận dự đoán của cùng một rep qua bốn camera; đồng thuận cao không chứng minh dự đoán đúng. Không coi confidence là accuracy.

**Camera:** góc phương vị tương đối được tính từ tâm camera calibration và hướng cơ thể 3D trong đoạn có nhãn, lấy trung vị theo thời gian. Squat: 0° phía trước, 90° ngang, 180° phía sau. Push-up: 0° phía đầu, 90° ngang, 180° phía chân. Đây là quy ước theo bài; không suy ra góc từ ID camera. Các nhóm không có clip được ghi N/A. Mẫu chủ yếu có góc trước/sau, không đủ để kết luận về quay ngang 90°, góc đúng 45° hoặc thay đổi độ cao camera. Các bảng chính dùng ảnh gốc; thử che khuất nhân tạo được báo riêng trong phần bổ sung.

**Cấu hình cụ thể:** HRNet là W32; Lite-HRNet là bản 18; ViTPose-B là Base-Simple; MoveNet là Lightning; LitePose là Auto-S. Confidence của các họ model không được hiệu chỉnh về cùng xác suất; khi đưa vào classifier gốc, confidence chỉ được chặn về [0, 1].

**Dữ liệu frame đo tốc độ:** các frame nguồn được lưu thành mảng BGR uint8 lossless trong `speed_frame_cache/`, dùng cùng pixel cho mọi model. Đọc cache và copy frame hoàn tất trước khi bắt đầu tính giờ. Cache không resize, không nén JPEG và không dùng khớp chuẩn làm đầu vào mạng.

**Phủ góc quay:** các nhóm chéo chỉ có rất ít clip, lệch khoảng 30–34° so với trục trước/sau, chưa gần 45°. Nhóm góc có thành phần người khác nhau nên không đủ để quy chênh lệch chất lượng chỉ cho góc quay. Bảng bốn ID camera dùng cùng tám người, còn biểu đồ nhóm góc ghi số clip (n) để thấy mức phủ.

**Decoder LitePose:** dùng đỉnh heatmap cho một người, trung bình hai stage; chưa dùng bước nhóm nhiều người bằng associative embedding. Đây là một giới hạn của adapter đã đo, cần xét khi so sánh với pipeline LitePose đầy đủ. Không diễn giải kết quả này thành trần chất lượng của cả họ LitePose.

**Đo tốc độ:** lượt đo riêng dùng 30 frame phân bố đều trên mỗi clip, cùng frame cho 10 model, batch 1 và warm-up 5 lần. Detector chạy thật trong vùng tính giờ đối với model top-down. Không tính đọc/giải mã video, vẽ giao diện hoặc ST-GCN++. FPS vì vậy là throughput xử lý pose, không phải FPS toàn ứng dụng đang hiển thị. Các con số cộng từ thời gian detector đã lưu ở lượt accuracy chỉ là ước lượng và không dùng cho bảng tốc độ cuối.

**Sai số pixel:** dùng khoảng cách L2; khớp không dự đoán được bị phạt bằng đường chéo ảnh, và sai số quá lớn được chặn ở mức đó. Đây là tiêu chí có phạt mất khớp, không phải MPJPE trên riêng các khớp phát hiện được.

**Detector chung:** bảng dưới là tỷ lệ frame không tìm thấy người bằng YOLOv8n dùng chung cho top-down. Nó không áp dụng cho các model one-stage; cần đọc cùng kết quả PCK và tỷ lệ mất khớp.

| Người | Bài | Camera | Frame thiếu bbox |
| --- | --- | --- | --- |
| s03 | Squat | 50591643 | 0.0% |
| s03 | Squat | 58860488 | 0.0% |
| s03 | Squat | 60457274 | 0.0% |
| s03 | Squat | 65906101 | 0.0% |
| s03 | Push-up | 50591643 | 0.0% |
| s03 | Push-up | 58860488 | 0.0% |
| s03 | Push-up | 60457274 | 12.9% |
| s03 | Push-up | 65906101 | 9.6% |
| s04 | Squat | 50591643 | 0.0% |
| s04 | Squat | 58860488 | 0.0% |
| s04 | Squat | 60457274 | 0.0% |
| s04 | Squat | 65906101 | 0.0% |
| s04 | Push-up | 50591643 | 0.0% |
| s04 | Push-up | 58860488 | 0.0% |
| s04 | Push-up | 60457274 | 8.3% |
| s04 | Push-up | 65906101 | 2.9% |
| s05 | Squat | 50591643 | 0.0% |
| s05 | Squat | 58860488 | 0.0% |
| s05 | Squat | 60457274 | 0.0% |
| s05 | Squat | 65906101 | 0.0% |
| s05 | Push-up | 50591643 | 0.0% |
| s05 | Push-up | 58860488 | 0.0% |
| s05 | Push-up | 60457274 | 2.2% |
| s05 | Push-up | 65906101 | 0.0% |
| s07 | Squat | 50591643 | 0.0% |
| s07 | Squat | 58860488 | 0.0% |
| s07 | Squat | 60457274 | 0.0% |
| s07 | Squat | 65906101 | 0.0% |
| s07 | Push-up | 50591643 | 0.0% |
| s07 | Push-up | 58860488 | 0.0% |
| s07 | Push-up | 60457274 | 23.8% |
| s07 | Push-up | 65906101 | 28.0% |
| s08 | Squat | 50591643 | 0.0% |
| s08 | Squat | 58860488 | 0.0% |
| s08 | Squat | 60457274 | 0.0% |
| s08 | Squat | 65906101 | 0.0% |
| s08 | Push-up | 50591643 | 0.0% |
| s08 | Push-up | 58860488 | 0.0% |
| s08 | Push-up | 60457274 | 0.4% |
| s08 | Push-up | 65906101 | 0.0% |
| s09 | Squat | 50591643 | 0.0% |
| s09 | Squat | 58860488 | 0.0% |
| s09 | Squat | 60457274 | 0.0% |
| s09 | Squat | 65906101 | 0.0% |
| s09 | Push-up | 50591643 | 0.0% |
| s09 | Push-up | 58860488 | 0.0% |
| s09 | Push-up | 60457274 | 7.3% |
| s09 | Push-up | 65906101 | 4.4% |
| s10 | Squat | 50591643 | 0.0% |
| s10 | Squat | 58860488 | 0.0% |
| s10 | Squat | 60457274 | 0.0% |
| s10 | Squat | 65906101 | 0.0% |
| s10 | Push-up | 50591643 | 0.0% |
| s10 | Push-up | 58860488 | 0.0% |
| s10 | Push-up | 60457274 | 0.0% |
| s10 | Push-up | 65906101 | 0.0% |
| s11 | Squat | 50591643 | 0.0% |
| s11 | Squat | 58860488 | 0.0% |
| s11 | Squat | 60457274 | 0.0% |
| s11 | Squat | 65906101 | 0.0% |
| s11 | Push-up | 50591643 | 0.0% |
| s11 | Push-up | 58860488 | 3.5% |
| s11 | Push-up | 60457274 | 45.5% |
| s11 | Push-up | 65906101 | 16.8% |

## Squat

Trong mẫu này, **RTMO-s** có PCK trung bình cao nhất (87.0%). **YOLOv8n-Pose** đạt FPS pipeline trung bình cao nhất (51.2). Sai số đếm rep thấp nhất là 0.00 rep/clip; có thể có nhiều model đồng hạng. Các tiêu chí được báo riêng, không gộp thành điểm tối ưu tùy ý. Hai model đầu chỉ chênh 0.01 điểm phần trăm PCK; xem thêm khoảng bất định theo người trong báo cáo bổ sung.

![So sánh Squat](figures/squat_summary.png)

| Model | PCK ↑ (%) | Sai số pixel ↓ | Đủ 12 khớp đúng (%) | Jitter ↓ | MAE rep ↓ | FPS TB clip ↑ | Đồng thuận lớp qua camera (%) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| YOLOv8n-Pose | 80.7 | 13.0 | 31.5 | 0.025 | 0.00 | 51.2 | 65.6 |
| YOLO11n-Pose | 81.0 | 12.3 | 31.6 | 0.026 | 0.22 | 49.6 | 62.5 |
| YOLO26n-Pose | 83.2 | 11.2 | 25.2 | 0.016 | 0.00 | 47.2 | 62.5 |
| RTMPose-m | 85.9 | 10.2 | 25.0 | 0.013 | 0.00 | 29.3 | 73.8 |
| RTMO-s | 87.0 | 9.9 | 37.3 | 0.012 | 0.00 | 30.8 | 67.5 |
| ViTPose-B | 87.0 | 10.1 | 33.1 | 0.013 | 0.00 | 19.4 | 75.0 |
| HRNet | 87.0 | 10.1 | 35.0 | 0.023 | 0.00 | 23.7 | 72.5 |
| Lite-HRNet | 84.7 | 11.5 | 32.9 | 0.030 | 0.12 | 35.9 | 74.4 |
| MoveNet-Lightning | 83.3 | 11.6 | 31.6 | 0.025 | 0.00 | 39.6 | 58.8 |
| LitePose-Auto-S | 70.4 | 23.6 | 22.7 | 0.068 | 0.47 | 25.9 | 60.6 |

![Camera Squat](figures/squat_cameras.png)

![Góc nhìn Squat](figures/squat_views.png)

![Từng khớp Squat](figures/squat_joints.png)

![Ổn định và mất khớp Squat](figures/squat_stability.png)

Nghi đảo trái–phải là chỉ báo hình học: cặp dự đoán gần vị trí chuẩn đã đổi bên hơn đúng bên với biên 0,1 chiều dài thân; loại các cặp chuẩn gần chồng nhau. Đây là ứng viên nhầm bên, không phải nhãn lỗi thủ công. Mất đầu ra nghĩa là không có tọa độ hợp lệ/confidence dương; nó không thay thế tiêu chí đủ 12 khớp đúng.

### Camera với RTMO-s — chọn theo PCK trung bình của bài

| Camera | Góc TB | PCK (%) | MAE rep | FPS | 10 model trên cùng frame |
| --- | --- | --- | --- | --- | --- |
| 50591643 | 151.3° | 88.7 | 0.00 | 29.4 | [Ảnh s03](comparisons/s03_squat_50591643.jpg) · [Video s03](comparisons/s03_squat_50591643.mp4) |
| 58860488 | 159.5° | 88.7 | 0.00 | 32.9 | [Ảnh s03](comparisons/s03_squat_58860488.jpg) · [Video s03](comparisons/s03_squat_58860488.mp4) |
| 60457274 | 27.1° | 85.8 | 0.00 | 30.3 | [Ảnh s03](comparisons/s03_squat_60457274.jpg) · [Video s03](comparisons/s03_squat_60457274.mp4) |
| 65906101 | 18.6° | 85.0 | 0.00 | 30.6 | [Ảnh s03](comparisons/s03_squat_65906101.jpg) · [Video s03](comparisons/s03_squat_65906101.mp4) |

Với RTMO-s, camera **50591643** có PCK cao nhất trong mẫu của bài (88.7%). Đây là so sánh các vị trí quay đang có, không phải kết luận tối ưu cho mọi góc quay.

![Đối chiếu 10 model Squat](comparisons/s03_squat_50591643.jpg)

Bảng số liệu tính toàn bộ 8 người. Video ghép hiển thị toàn bộ lưới frame của đoạn đánh giá, gồm ngữ cảnh một giây hai đầu; số PCK và rep trên từng panel là kết quả toàn đoạn đánh giá của clip đó, không phải số rep đang chạy trong video. Chấm xanh lá: khớp Fit3D chiếu lên ảnh. Đường/chấm hồng: khớp model có confidence >0,1. Cùng frame và cùng vùng hiển thị cho cả 10 model; vùng cắt phục vụ hiển thị không được dùng làm đầu vào model. Video phát ở 25 fps đúng với lưới lấy mẫu.

### Toàn bộ video đối chiếu của bài

| Người | Camera | 10 model cùng video |
| --- | --- | --- |
| s03 | 50591643 | [Ảnh](comparisons/s03_squat_50591643.jpg) · [Video](comparisons/s03_squat_50591643.mp4) |
| s03 | 58860488 | [Ảnh](comparisons/s03_squat_58860488.jpg) · [Video](comparisons/s03_squat_58860488.mp4) |
| s03 | 60457274 | [Ảnh](comparisons/s03_squat_60457274.jpg) · [Video](comparisons/s03_squat_60457274.mp4) |
| s03 | 65906101 | [Ảnh](comparisons/s03_squat_65906101.jpg) · [Video](comparisons/s03_squat_65906101.mp4) |
| s04 | 50591643 | [Ảnh](comparisons/s04_squat_50591643.jpg) · [Video](comparisons/s04_squat_50591643.mp4) |
| s04 | 58860488 | [Ảnh](comparisons/s04_squat_58860488.jpg) · [Video](comparisons/s04_squat_58860488.mp4) |
| s04 | 60457274 | [Ảnh](comparisons/s04_squat_60457274.jpg) · [Video](comparisons/s04_squat_60457274.mp4) |
| s04 | 65906101 | [Ảnh](comparisons/s04_squat_65906101.jpg) · [Video](comparisons/s04_squat_65906101.mp4) |
| s05 | 50591643 | [Ảnh](comparisons/s05_squat_50591643.jpg) · [Video](comparisons/s05_squat_50591643.mp4) |
| s05 | 58860488 | [Ảnh](comparisons/s05_squat_58860488.jpg) · [Video](comparisons/s05_squat_58860488.mp4) |
| s05 | 60457274 | [Ảnh](comparisons/s05_squat_60457274.jpg) · [Video](comparisons/s05_squat_60457274.mp4) |
| s05 | 65906101 | [Ảnh](comparisons/s05_squat_65906101.jpg) · [Video](comparisons/s05_squat_65906101.mp4) |
| s07 | 50591643 | [Ảnh](comparisons/s07_squat_50591643.jpg) · [Video](comparisons/s07_squat_50591643.mp4) |
| s07 | 58860488 | [Ảnh](comparisons/s07_squat_58860488.jpg) · [Video](comparisons/s07_squat_58860488.mp4) |
| s07 | 60457274 | [Ảnh](comparisons/s07_squat_60457274.jpg) · [Video](comparisons/s07_squat_60457274.mp4) |
| s07 | 65906101 | [Ảnh](comparisons/s07_squat_65906101.jpg) · [Video](comparisons/s07_squat_65906101.mp4) |
| s08 | 50591643 | [Ảnh](comparisons/s08_squat_50591643.jpg) · [Video](comparisons/s08_squat_50591643.mp4) |
| s08 | 58860488 | [Ảnh](comparisons/s08_squat_58860488.jpg) · [Video](comparisons/s08_squat_58860488.mp4) |
| s08 | 60457274 | [Ảnh](comparisons/s08_squat_60457274.jpg) · [Video](comparisons/s08_squat_60457274.mp4) |
| s08 | 65906101 | [Ảnh](comparisons/s08_squat_65906101.jpg) · [Video](comparisons/s08_squat_65906101.mp4) |
| s09 | 50591643 | [Ảnh](comparisons/s09_squat_50591643.jpg) · [Video](comparisons/s09_squat_50591643.mp4) |
| s09 | 58860488 | [Ảnh](comparisons/s09_squat_58860488.jpg) · [Video](comparisons/s09_squat_58860488.mp4) |
| s09 | 60457274 | [Ảnh](comparisons/s09_squat_60457274.jpg) · [Video](comparisons/s09_squat_60457274.mp4) |
| s09 | 65906101 | [Ảnh](comparisons/s09_squat_65906101.jpg) · [Video](comparisons/s09_squat_65906101.mp4) |
| s10 | 50591643 | [Ảnh](comparisons/s10_squat_50591643.jpg) · [Video](comparisons/s10_squat_50591643.mp4) |
| s10 | 58860488 | [Ảnh](comparisons/s10_squat_58860488.jpg) · [Video](comparisons/s10_squat_58860488.mp4) |
| s10 | 60457274 | [Ảnh](comparisons/s10_squat_60457274.jpg) · [Video](comparisons/s10_squat_60457274.mp4) |
| s10 | 65906101 | [Ảnh](comparisons/s10_squat_65906101.jpg) · [Video](comparisons/s10_squat_65906101.mp4) |
| s11 | 50591643 | [Ảnh](comparisons/s11_squat_50591643.jpg) · [Video](comparisons/s11_squat_50591643.mp4) |
| s11 | 58860488 | [Ảnh](comparisons/s11_squat_58860488.jpg) · [Video](comparisons/s11_squat_58860488.mp4) |
| s11 | 60457274 | [Ảnh](comparisons/s11_squat_60457274.jpg) · [Video](comparisons/s11_squat_60457274.mp4) |
| s11 | 65906101 | [Ảnh](comparisons/s11_squat_65906101.jpg) · [Video](comparisons/s11_squat_65906101.mp4) |

### Clip khó nhất đối với model đứng đầu PCK trung bình

RTMO-s: s08, camera 65906101, PCK 57.2%, sai số đếm 0 rep. Đây là lựa chọn theo kết quả toàn đoạn, không phải chọn ảnh đẹp nhất; ảnh vẫn chỉ là một thời điểm minh họa.

![Clip khó](comparisons/s08_squat_65906101.jpg)

[Xem video 10 model trên clip này](comparisons/s08_squat_65906101.mp4)

## Push-up

Trong mẫu này, **RTMPose-m** có PCK trung bình cao nhất (53.4%). **YOLOv8n-Pose** đạt FPS pipeline trung bình cao nhất (49.9). Sai số đếm rep thấp nhất là 0.78 rep/clip; có thể có nhiều model đồng hạng. Các tiêu chí được báo riêng, không gộp thành điểm tối ưu tùy ý. Hai model đầu chỉ chênh 0.03 điểm phần trăm PCK; xem thêm khoảng bất định theo người trong báo cáo bổ sung.

![So sánh Push-up](figures/pushup_summary.png)

| Model | PCK ↑ (%) | Sai số pixel ↓ | Đủ 12 khớp đúng (%) | Jitter ↓ | MAE rep ↓ | FPS TB clip ↑ | Đồng thuận lớp qua camera (%) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| YOLOv8n-Pose | 31.3 | 27.1 | 0.0 | 0.145 | 2.34 | 49.9 | 50.6 |
| YOLO11n-Pose | 27.0 | 28.9 | 0.0 | 0.146 | 2.88 | 48.6 | 50.6 |
| YOLO26n-Pose | 34.1 | 27.9 | 0.0 | 0.126 | 1.94 | 47.3 | 58.8 |
| RTMPose-m | 53.4 | 77.8 | 0.0 | 0.041 | 1.12 | 29.8 | 72.5 |
| RTMO-s | 48.6 | 14.7 | 0.0 | 0.064 | 0.78 | 28.1 | 65.6 |
| ViTPose-B | 53.4 | 79.1 | 0.3 | 0.070 | 1.44 | 20.4 | 62.5 |
| HRNet | 51.8 | 79.9 | 0.2 | 0.101 | 1.72 | 24.3 | 63.1 |
| Lite-HRNet | 37.8 | 92.2 | 0.0 | 0.193 | 2.41 | 36.2 | 58.8 |
| MoveNet-Lightning | 44.0 | 83.8 | 0.0 | 0.100 | 2.56 | 40.0 | 54.4 |
| LitePose-Auto-S | 23.7 | 69.8 | 0.0 | 0.660 | 3.69 | 25.6 | 63.1 |

![Camera Push-up](figures/pushup_cameras.png)

![Góc nhìn Push-up](figures/pushup_views.png)

![Từng khớp Push-up](figures/pushup_joints.png)

![Ổn định và mất khớp Push-up](figures/pushup_stability.png)

Nghi đảo trái–phải là chỉ báo hình học: cặp dự đoán gần vị trí chuẩn đã đổi bên hơn đúng bên với biên 0,1 chiều dài thân; loại các cặp chuẩn gần chồng nhau. Đây là ứng viên nhầm bên, không phải nhãn lỗi thủ công. Mất đầu ra nghĩa là không có tọa độ hợp lệ/confidence dương; nó không thay thế tiêu chí đủ 12 khớp đúng.

### Camera với RTMPose-m — chọn theo PCK trung bình của bài

| Camera | Góc TB | PCK (%) | MAE rep | FPS | 10 model trên cùng frame |
| --- | --- | --- | --- | --- | --- |
| 50591643 | 158.1° | 54.0 | 3.12 | 29.1 | [Ảnh s03](comparisons/s03_pushup_50591643.jpg) · [Video s03](comparisons/s03_pushup_50591643.mp4) |
| 58860488 | 159.9° | 53.2 | 1.38 | 30.2 | [Ảnh s03](comparisons/s03_pushup_58860488.jpg) · [Video s03](comparisons/s03_pushup_58860488.mp4) |
| 60457274 | 28.7° | 52.8 | 0.00 | 30.1 | [Ảnh s03](comparisons/s03_pushup_60457274.jpg) · [Video s03](comparisons/s03_pushup_60457274.mp4) |
| 65906101 | 25.5° | 53.6 | 0.00 | 29.7 | [Ảnh s03](comparisons/s03_pushup_65906101.jpg) · [Video s03](comparisons/s03_pushup_65906101.mp4) |

Với RTMPose-m, camera **50591643** có PCK cao nhất trong mẫu của bài (54.0%). Đây là so sánh các vị trí quay đang có, không phải kết luận tối ưu cho mọi góc quay.

![Đối chiếu 10 model Push-up](comparisons/s03_pushup_50591643.jpg)

Bảng số liệu tính toàn bộ 8 người. Video ghép hiển thị toàn bộ lưới frame của đoạn đánh giá, gồm ngữ cảnh một giây hai đầu; số PCK và rep trên từng panel là kết quả toàn đoạn đánh giá của clip đó, không phải số rep đang chạy trong video. Chấm xanh lá: khớp Fit3D chiếu lên ảnh. Đường/chấm hồng: khớp model có confidence >0,1. Cùng frame và cùng vùng hiển thị cho cả 10 model; vùng cắt phục vụ hiển thị không được dùng làm đầu vào model. Video phát ở 25 fps đúng với lưới lấy mẫu.

### Toàn bộ video đối chiếu của bài

| Người | Camera | 10 model cùng video |
| --- | --- | --- |
| s03 | 50591643 | [Ảnh](comparisons/s03_pushup_50591643.jpg) · [Video](comparisons/s03_pushup_50591643.mp4) |
| s03 | 58860488 | [Ảnh](comparisons/s03_pushup_58860488.jpg) · [Video](comparisons/s03_pushup_58860488.mp4) |
| s03 | 60457274 | [Ảnh](comparisons/s03_pushup_60457274.jpg) · [Video](comparisons/s03_pushup_60457274.mp4) |
| s03 | 65906101 | [Ảnh](comparisons/s03_pushup_65906101.jpg) · [Video](comparisons/s03_pushup_65906101.mp4) |
| s04 | 50591643 | [Ảnh](comparisons/s04_pushup_50591643.jpg) · [Video](comparisons/s04_pushup_50591643.mp4) |
| s04 | 58860488 | [Ảnh](comparisons/s04_pushup_58860488.jpg) · [Video](comparisons/s04_pushup_58860488.mp4) |
| s04 | 60457274 | [Ảnh](comparisons/s04_pushup_60457274.jpg) · [Video](comparisons/s04_pushup_60457274.mp4) |
| s04 | 65906101 | [Ảnh](comparisons/s04_pushup_65906101.jpg) · [Video](comparisons/s04_pushup_65906101.mp4) |
| s05 | 50591643 | [Ảnh](comparisons/s05_pushup_50591643.jpg) · [Video](comparisons/s05_pushup_50591643.mp4) |
| s05 | 58860488 | [Ảnh](comparisons/s05_pushup_58860488.jpg) · [Video](comparisons/s05_pushup_58860488.mp4) |
| s05 | 60457274 | [Ảnh](comparisons/s05_pushup_60457274.jpg) · [Video](comparisons/s05_pushup_60457274.mp4) |
| s05 | 65906101 | [Ảnh](comparisons/s05_pushup_65906101.jpg) · [Video](comparisons/s05_pushup_65906101.mp4) |
| s07 | 50591643 | [Ảnh](comparisons/s07_pushup_50591643.jpg) · [Video](comparisons/s07_pushup_50591643.mp4) |
| s07 | 58860488 | [Ảnh](comparisons/s07_pushup_58860488.jpg) · [Video](comparisons/s07_pushup_58860488.mp4) |
| s07 | 60457274 | [Ảnh](comparisons/s07_pushup_60457274.jpg) · [Video](comparisons/s07_pushup_60457274.mp4) |
| s07 | 65906101 | [Ảnh](comparisons/s07_pushup_65906101.jpg) · [Video](comparisons/s07_pushup_65906101.mp4) |
| s08 | 50591643 | [Ảnh](comparisons/s08_pushup_50591643.jpg) · [Video](comparisons/s08_pushup_50591643.mp4) |
| s08 | 58860488 | [Ảnh](comparisons/s08_pushup_58860488.jpg) · [Video](comparisons/s08_pushup_58860488.mp4) |
| s08 | 60457274 | [Ảnh](comparisons/s08_pushup_60457274.jpg) · [Video](comparisons/s08_pushup_60457274.mp4) |
| s08 | 65906101 | [Ảnh](comparisons/s08_pushup_65906101.jpg) · [Video](comparisons/s08_pushup_65906101.mp4) |
| s09 | 50591643 | [Ảnh](comparisons/s09_pushup_50591643.jpg) · [Video](comparisons/s09_pushup_50591643.mp4) |
| s09 | 58860488 | [Ảnh](comparisons/s09_pushup_58860488.jpg) · [Video](comparisons/s09_pushup_58860488.mp4) |
| s09 | 60457274 | [Ảnh](comparisons/s09_pushup_60457274.jpg) · [Video](comparisons/s09_pushup_60457274.mp4) |
| s09 | 65906101 | [Ảnh](comparisons/s09_pushup_65906101.jpg) · [Video](comparisons/s09_pushup_65906101.mp4) |
| s10 | 50591643 | [Ảnh](comparisons/s10_pushup_50591643.jpg) · [Video](comparisons/s10_pushup_50591643.mp4) |
| s10 | 58860488 | [Ảnh](comparisons/s10_pushup_58860488.jpg) · [Video](comparisons/s10_pushup_58860488.mp4) |
| s10 | 60457274 | [Ảnh](comparisons/s10_pushup_60457274.jpg) · [Video](comparisons/s10_pushup_60457274.mp4) |
| s10 | 65906101 | [Ảnh](comparisons/s10_pushup_65906101.jpg) · [Video](comparisons/s10_pushup_65906101.mp4) |
| s11 | 50591643 | [Ảnh](comparisons/s11_pushup_50591643.jpg) · [Video](comparisons/s11_pushup_50591643.mp4) |
| s11 | 58860488 | [Ảnh](comparisons/s11_pushup_58860488.jpg) · [Video](comparisons/s11_pushup_58860488.mp4) |
| s11 | 60457274 | [Ảnh](comparisons/s11_pushup_60457274.jpg) · [Video](comparisons/s11_pushup_60457274.mp4) |
| s11 | 65906101 | [Ảnh](comparisons/s11_pushup_65906101.jpg) · [Video](comparisons/s11_pushup_65906101.mp4) |

### Clip khó nhất đối với model đứng đầu PCK trung bình

RTMPose-m: s08, camera 65906101, PCK 31.4%, sai số đếm 0 rep. Đây là lựa chọn theo kết quả toàn đoạn, không phải chọn ảnh đẹp nhất; ảnh vẫn chỉ là một thời điểm minh họa.

![Clip khó](comparisons/s08_pushup_65906101.jpg)

[Xem video 10 model trên clip này](comparisons/s08_pushup_65906101.mp4)

## Kết quả chi tiết và giới hạn

[Cấu hình từng checkpoint và kích thước tensor](MODEL_CONFIG.md) · [Phần cứng và driver](HARDWARE.json)

[Bảng CSV theo bài, model, người và camera](comparison_by_exercise_camera.csv) · [Số liệu JSON đầy đủ](all_measured_results.json) · [Đo FPS trực tiếp](speed_results.json) · [Manifest lượt chạy](run_manifest.json) · [Nguồn trọng số và hash](MODEL_PROVENANCE.json) · [Kiểm tra GPU](gpu_smoke.json) · [Kiểm tra chuyển đổi](conversion_validation.json)

Dữ liệu có 8 người và hai bài phù hợp, chưa đủ để kết luận một model tốt nhất cho tất cả người tập, bài tập hoặc điều kiện quay. Các video squat có dụng cụ/tạ trong Fit3D có thể khác phân bố dữ liệu của classifier SmartGym. Những bài SmartGym chưa khớp tên trong Fit3D không được thay bằng warmup hay gán nhãn tùy ý.

Mã và trọng số của SmartGym, cùng dữ liệu Fit3D, chỉ được đọc. Toàn bộ môi trường, mã benchmark, checkpoint tải thêm và đầu ra ở thư mục Fit3D_Pose_Benchmark.


## Điều kiện che khuất bổ sung

[Kiểm tra vật cản nhân tạo trên cả 64 clip](occlusion/REPORT.md). Đây là thử nghiệm riêng; các bảng chính dùng ảnh gốc. Chưa có video để thử thay đổi độ cao camera hoặc góc ngang 90°.


## Xem và kiểm tra thêm

[Mở trình xem tương tác](index.html) · [Khoảng bất định và bảng đầy đủ theo camera](ANALYSIS.md) · [Phạm vi bài và điều kiện quay](dataset_audit/SCOPE.md) · [Mẫu gán nhãn lỗi thủ công](form_annotation_template.csv).

Mẫu nhãn để trống, mỗi hàng là một rep vật lý với đường dẫn bốn camera. Chỉ điền nhãn sau khi người có chuyên môn kiểm tra video; không dùng nhãn dự đoán hoặc ngưỡng góc làm ground truth.


[Kiểm tra riêng khớp hông và giới hạn tham chiếu 2D](HIP_AUDIT.md). Phân tích này không sửa GT hoặc kết quả chính.
