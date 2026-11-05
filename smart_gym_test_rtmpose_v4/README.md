# Smart Gym V4 — Bốn bài tập đa nhãn Qualcomm

Squat có 14 nhãn; chống đẩy 21 nhãn; jumping jacks (bật nhảy dang tay chân) 29 nhãn; gập bụng ngược 19 nhãn. Mỗi video có thể có nhiều nhãn đồng thời. Cả bốn bài yêu cầu đúng trọng số V4 và cấu hình nhãn đi kèm trong `weights`; thiếu bộ này sẽ báo lỗi thay vì tự chuyển về bản bốn lớp.

Nguồn nhãn cố định: `stgcn_model_training/Dataset/Qualcom dataset/fine_grained_labels.json`. Tệp gốc chỉ được đọc; dữ liệu chuyển đổi lưu riêng trong `data/v4`. SHA-256 (mã kiểm tra nội dung) xác nhận tệp gốc không bị sửa.

## Chạy giao diện

Mở PowerShell trong thư mục `smart_gym_test_rtmpose_v4`:

```powershell
python app.py --exercise squat --video "test_videos_benchmark/squats/BACK_ROUNDING_00001672.mp4" --device cuda
python app.py --exercise jump_jack --video "test_videos_benchmark/jumping_jacks/ARMS_INCOMPLETE_00001308.mp4" --device cuda
python app.py --exercise jump_jack --device cuda --camera-id 0
```

Máy không có GPU NVIDIA dùng `--device cpu`. Sau khi huấn luyện xong, đóng và mở lại ứng dụng để nạp trọng số mới. Xem [giải thích giao diện](GIAI_THICH_GIAO_DIEN_V4.md).

Sau khi cập nhật mã, đóng cửa sổ V4 cũ rồi chạy lại lệnh trên. Bấm chuột vào cửa sổ V4 trước khi dùng phím; có thể bấm trực tiếp bốn nút chọn bài ở phía trên hình ảnh. Dòng **ĐANG CHỌN [số]: tên bài** và nút màu xanh xác nhận bài đang dùng. Chuyển bài sẽ xóa kết quả cũ và phát lại video từ đầu, kể cả khi video đã kết thúc. Cả bốn bài hỗ trợ bảng nhiều nhãn cho toàn video; khi dùng camera, chờ đủ đoạn chuyển động mới có kết quả. Một số nhãn thời gian chỉ áp dụng toàn video.

Camera (máy quay) mở trong tiến trình riêng để tránh treo cửa sổ nếu driver (trình điều khiển thiết bị) không phản hồi. Giao diện hiển thị đang mở hoặc lỗi kết nối; vẫn có thể chọn bài, bấm V chọn video hay Q thoát. Bấm C sẽ đóng kết nối cũ trước khi thử lại. Có thể mất khoảng 30 giây khi tự tìm camera.

Trên máy đang kiểm tra: webcam thật **1080P Web Camera** là `--camera-id 0`; chỉ số 1 là OBS Virtual Camera (camera ảo OBS), chỉ số 2 là SplitCam Virtual Camera (camera ảo SplitCam). Không dùng hai camera ảo này để thay cho webcam thật. Nếu webcam 0 không có hình, đóng V4, thử ứng dụng Camera của Windows rồi đóng ứng dụng Camera trước khi mở lại V4. Khi Camera của Windows cũng không có hình, cần kiểm tra kết nối USB và thiết bị trước.

| Phím | Chức năng |
|---|---|
| V / C | Chọn video / máy quay |
| P / Space | Tạm dừng hoặc tiếp tục |
| T | Xem toàn video/cửa sổ trực tiếp hoặc lượt gần nhất |
| R | Phát lại, xóa bộ đếm |
| 1–4 | Squat / chống đẩy / jumping jacks / gập bụng ngược |
| S | Lưu ảnh vào `logs` |
| Q / Esc | Thoát |

Kết quả toàn video được tính trước khi phát, nên bảng giữ nguyên khi video chạy. Video dừng ở cuối để đọc kết quả.

## Kiểm tra và xuất ảnh giao diện

```powershell
python test_single_video.py --exercise jump_jack --video "test_videos_benchmark/jumping_jacks/ARMS_INCOMPLETE_00001308.mp4" --device cuda --output logs/single_jumpjack.json --snapshot logs/single_jumpjack.png
python test_benchmark_models.py --exercise squat --device cuda
python test_benchmark_models.py --exercise jumpjack --device cuda
python test_benchmark_models.py --exercise pushup --device cuda
python test_benchmark_models.py --exercise crunch --device cuda
```

Kết quả: `logs/benchmark_squat_v4.json`, `logs/benchmark_jumpjack_v4.json` và CSV tương ứng. Ảnh ở `logs/benchmark_previews`, `logs/benchmark_previews_jumpjack`. Khớp benchmark chỉ lưu tại `logs/benchmark_pose_cache`, không dùng huấn luyện.

## Huấn luyện và kiểm chứng

Chạy từ thư mục gốc GYM:

```powershell
python stgcn_model_training/train_pipeline/run_qualcomm_v4_pipeline.py --exercise all --device cuda --epochs 70
python stgcn_model_training/train_pipeline/audit_benchmark_isolation.py
```

Chuỗi xử lý đọc đúng JSON đã chỉ định; loại benchmark theo mã video và nội dung khỏi **cả huấn luyện, xác thực và kiểm tra nội bộ**. Giữ tập kiểm tra gốc Qualcomm; tách xác thực chỉ từ huấn luyện gốc. Các bản sao nội dung không được vượt ranh giới tập.

YOLOX-M (phát hiện người) và RTMPose-M (ước lượng khớp) dùng trọng số huấn luyện sẵn. Squat lấy 64 khung hình toàn video và 16 đặc trưng bổ sung; jumping jacks lấy 128 khung hình và 32 đặc trưng, gồm thông tin thời gian và nhịp chuyển động.

ST-GCN++ (mạng đồ thị không gian và thời gian) được huấn luyện riêng từng bài từ đầu. Dùng weighted BCE (sai số nhị phân có trọng số), AdamW (thuật toán cập nhật trọng số) và early stopping (dừng sớm). Trọng số nhãn chỉ tính từ huấn luyện. Chọn mô hình bằng macro AP (độ chính xác trung bình theo xếp hạng nhãn) trên xác thực; chọn ngưỡng từng nhãn chỉ từ xác thực.

Chương trình kiểm kê lại benchmark trước bước học và dừng nếu phát hiện trùng. Đối chiếu phát hiện tệp nguyên nội dung dù đổi tên; chưa xác minh các bản đã mã hóa lại hoặc cắt ghép khác mã video. Benchmark chỉ dùng đánh giá sau khi cố định mô hình/ngưỡng.

## Ảnh báo cáo và nơi lưu

Xuất lại ảnh từ kết quả đã lưu, không huấn luyện hoặc đổi ngưỡng:

```powershell
python stgcn_model_training/train_pipeline/export_qualcomm_v4_figures.py --exercise all
```

| Thư mục dưới `stgcn_model_training` | Nội dung |
|---|---|
| `data/v4` | Danh sách chia tập, nhãn dẫn xuất, chú thích, khớp |
| `models/v4` | Hai mô hình PTH, ONNX và cấu hình nhãn/ngưỡng |
| `outputs/v4` | Đường sai số, ma trận nhầm lẫn, báo cáo, lịch sử học |

Tên tệp chứa `squat` hoặc `jumpjack`. PNG 300 DPI (mật độ điểm ảnh để in); hình tổng hợp có SVG (phóng to không vỡ). Mỗi nhãn có ma trận 2×2 riêng. Hướng dẫn ảnh: `HUONG_DAN_ANH_BAO_CAO_SQUAT_V4.md` và `HUONG_DAN_ANH_BAO_CAO_JUMPJACK_V4.md` trong thư mục kết quả.

`stgcn_model_training` là junction (liên kết thư mục) tới `stgcn_squat_project`; hai đường dẫn cùng dữ liệu.

## Diễn giải nhãn

Nhãn có nghĩa là chú thích Qualcomm được dự đoán xuất hiện. Không ghi nhãn không đồng nghĩa đã xác minh tư thế đúng. Điểm sigmoid (điểm độc lập từng nhãn) không cộng thành 100% và chưa hiệu chuẩn thành xác suất kết luận đúng.

Các nhãn cần toàn video không tự suy ra từ một lượt/cửa sổ ngắn: giữ tư thế, bắt đầu muộn của squat; tốc độ, chỉ làm một lần và dừng sớm của jumping jacks. Nhãn không có mẫu dương huấn luyện hoặc xác thực được đánh dấu thiếu dữ liệu chọn ngưỡng, không tự báo có.

ROM — range of motion (biên độ vận động) giữ nguyên thang Qualcomm; không tự chuyển thành độ góc hoặc mức đạt chuẩn. Nhãn squat `knees over toes` có tên nói gối vượt mũi chân nhưng mô tả gốc nói ngược lại; giao diện ghi rõ mâu thuẫn.

Các tập độc lập theo video/nội dung; chưa chứng minh độc lập theo người tập. Chưa đánh giá thực tế máy quay trực tiếp hoặc độ chính xác đếm lượt với nhãn đếm lượt chuẩn.

## Hai bài nằm sàn V4

Chống đẩy dùng nhãn `pushups`; gập bụng ngược dùng `reverse crunches`, không thay thế bằng nhãn sit-ups (gập thân). Mô hình mới nhận 128 khung mẫu và 32 đặc trưng ngữ cảnh. Trọng số, ngưỡng và tiền xử lý phải đi cùng phiên bản.

Khi thiếu khớp quan trọng, chương trình chờ quan sát rõ hơn thay vì kết luận đúng kỹ thuật. Bộ đếm ưu tiên một bên cơ thể có khớp đủ rõ; mất khớp hoặc đổi bên trong lượt không được tự tính thành lượt hoàn thành. Cơ chế này không sửa được khớp bị bộ tìm khớp đoán sai nhưng vẫn cho điểm tin cậy cao.

Xem kết quả và giới hạn tại [báo cáo hai bài V4](../KET_QUA_CHONG_DAY_GAP_BUNG_V4.md). Ảnh loss (sai số), confusion matrix (ma trận nhầm lẫn) và bảng từng nhãn ở `../stgcn_model_training/outputs/v4`.

Nếu cần chạy lại riêng hai bài mới, từ thư mục gốc GYM:

```powershell
python stgcn_model_training/train_pipeline/run_floor_v4_pipeline.py
python stgcn_model_training/train_pipeline/finish_floor_v4.py
```

Lệnh thứ nhất trích xuất, huấn luyện tối đa 70 vòng, kiểm chứng và xuất ảnh. Lệnh thứ hai đánh giá video giữ riêng, xuất báo cáo và chạy kiểm thử chương trình. Chỉ chạy lại khi muốn huấn luyện/đánh giá lại; không cần chạy trước mỗi lần mở giao diện. Hai lệnh này không huấn luyện lại squat hoặc jumping jacks.
