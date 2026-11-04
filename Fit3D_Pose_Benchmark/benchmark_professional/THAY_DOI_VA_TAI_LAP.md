# Thay đổi và tái lập benchmark SmartGym

| Hạng mục | Báo cáo trước | Bản cập nhật |
|---|---|---|
| RTMPose-m | SimCC lấy trung bình hai đỉnh | Dùng min của hai đỉnh và xử lý đỉnh không dương theo MMDeploy. Đo lại 64 clip trên AMD RX 5600 XT với DirectML. |
| RTMPose-m squat | PCK 85,8608%, MAE 0,0000 | PCK 85,8608%, MAE 0,0000. |
| RTMPose-m chống đẩy | PCK 53,3928%, MAE 1,1250 | PCK 53,3928%, MAE 1,3125. Số lượt dự đoán thay đổi ở 8/32 clip. |
| FPS RTMPose-m | 29,34 squat và 29,76 chống đẩy | Lượt đo mới 37,85 và 39,07 FPS. Chống đẩy đạt 38,19 FPS khi chạy mạng pose, với 51/960 frame thiếu bbox. Đối chứng xen kẽ bên dưới cho thấy mức chênh giữa hai lượt benchmark không thể quy cho decoder. |
| Che khuất | Hai model, 32 clip/bài | Đo lại RTMPose-m trên cùng 32 clip chống đẩy và cùng hình chữ nhật. PCK sạch/che vẫn 53,4462%/29,2448%. Dữ liệu RTMO-s squat giữ theo lượt gốc. |
| LitePose-Auto-S | Adapter heatmap xuất hiện trong bảng cùng 9 model | Vẫn có đủ 8 dòng camera và xuất hiện ở biểu đồ, ký hiệu † thăm dò. Top 3 chỉ tính 9 cấu hình đủ điều kiện xếp hạng theo phạm vi báo cáo. |
| Thông số gốc | Nguồn Body8 tham chiếu cạnh kết quả RTMPose | Định danh đúng Body7 e48f03d0. Giữ 420e theo tên checkpoint, LR và optimizer N/A vì chưa xác minh cho artifact này. |
| Báo cáo | Bố cục 10 mục có khổ Letter và trang ngang | Word và PDF theo đúng 14 trang A4 dọc, phương pháp ở trang 2, thông số ở trang 8–9, đủ 80 dòng ở trang 10–13. |

Đối chứng tốc độ dùng 8 clip, mỗi clip 30 frame, đo xen kẽ decoder cũ và mới. Squat đạt 38,44 và 38,33 FPS. Chống đẩy đạt 40,89 và 40,78 FPS. Số này mô tả độ nhạy với decoder trong cùng lượt, còn bảng chính ghi throughput đã lưu theo từng cấu hình. Chi tiết ở [paired_speed_control.json](results/paired_speed_control.json).

## Giới hạn còn lại

- LitePose cần associative embedding grouping và đối chiếu pipeline native trước khi xếp hạng như model gốc. Tương đương hoàn chỉnh với framework native của một số artifact cộng đồng, gồm MoveNet Web, còn cần kiểm tra.
- Bốn camera chủ yếu ở hai đầu trục cơ thể. Tập hiện tại thiếu góc ngang 90°, góc gần 45° và thử độ cao có kiểm soát.
- Tám người phù hợp cho nghiên cứu thăm dò. Cần kiểm chứng các ứng viên trên người mới và camera mục tiêu. Pose FPS chưa bao gồm hệ thống camera, hiển thị và classifier.
- Chưa có nhãn chuẩn để chấm nhận diện lỗi kỹ thuật. Chưa đo nhận dạng bài tự động, RAM/VRAM đỉnh hoặc độ lặp FPS của cả 10 cấu hình.
- Hông và chiều dài thân chiếu làm PCK chống đẩy nhạy theo góc. Ngưỡng PCK giữ cố định để đối chiếu đúng với benchmark ban đầu.

## Dữ liệu và cách tái lập

Thư mục này nằm cạnh benchmark gốc. Hai mạng ONNX dùng cho lượt sửa là bản sao đúng hash. Thư mục results lưu 64 NPZ RTMPose-m mới, timing từng frame, 32 kết quả che mới và các bảng hợp nhất. 576 lượt model–clip còn lại lấy từ benchmark gốc. Hash tham chiếu và cách gộp nằm trong [provenance_revision.json](results/provenance_revision.json).

Từ PowerShell tại thư mục `benchmark_professional`, có thể dùng môi trường benchmark của dự án để tái lập. Lượt tốc độ và che chạy tuần tự khi không có inference cạnh tranh.

```powershell
$env:POSE_BENCHMARK_RESULTS = (Resolve-Path .\results).Path
$env:PYTHONIOENCODING = 'utf-8'
& '..\.venv-benchmark\Scripts\python.exe' -B -u .\code\run_benchmark.py --preserve-manifest --subjects s03 s04 s05 s07 s08 s09 s10 s11 --models RTMPose-m
& '..\.venv-benchmark\Scripts\python.exe' -B -u .\code\publish_results.py
& '..\.venv-benchmark\Scripts\python.exe' -B -u .\code\speed_control.py
& '..\.venv-benchmark\Scripts\python.exe' -B .\code\create_figures.py
```

`code/build_report.py` dựng Word từ JSON/CSV và ảnh đầu ra, bằng Python có python-docx. Dữ liệu số đầy đủ ở [comparison_camera_summary.csv](results/comparison_camera_summary.csv) và [comparison_by_clip.json](results/comparison_by_clip.json). Bản Word được đối chiếu trực tiếp với 80 dòng CSV và kiểm tra render ở cả 14 trang.