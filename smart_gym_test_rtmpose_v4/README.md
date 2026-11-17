# Smart Gym V4 — sáu bài đa nhãn, phân tích theo lượt

## Cách xử lý hiện tại

Video/camera → YOLOX-M tìm người → RTMPose-M tìm khớp → SciPy cắt lượt →
chuẩn hóa khung xương → ST-GCN++ dự đoán nhiều nhãn độc lập.

| Phím | Bài | Mã dùng với --exercise | Nhãn |
|---|---|---|---:|
| 1 | Squat | squat | 14 |
| 2 | Chống đẩy | push_up | 21 |
| 3 | Jumping jacks | jump_jack | 29 |
| 4 | Gập bụng ngược | situp | 19 |
| 5 | High knees | high_knees | 31 |
| 6 | Butt kickers | butt_kickers | 14 |

Mã `situp` là khóa giao diện kế thừa; dữ liệu của bài này là nhãn Qualcomm
`reverse crunches` (gập bụng ngược), không phải bài gập thân sit-ups.

Cả sáu mô hình chỉ nhận một tensor `skeleton` dạng batch × 3 × 64 × 17,
không nhận vector hay nhánh ngữ cảnh. Ba kênh là x/y/độ tin cậy, 17 khớp
COCO, 64 là số thời điểm nội suy của một lượt, không phải FPS.

## Mở app

Từ thư mục gốc GYM, dùng môi trường Python đã cài thư viện và trọng số:

```powershell
python smart_gym_test_rtmpose_v4/app.py
python smart_gym_test_rtmpose_v4/app.py --exercise high_knees --camera-id 0
python smart_gym_test_rtmpose_v4/app.py --video "duong_dan/video.mp4" --exercise butt_kickers
```

Có thể thêm `--device cpu` khi không dùng CUDA. CPU có thể chậm hơn; không suy
FPS camera từ thời gian chạy riêng mô hình ONNX.

Bấm 1–6 hoặc nút chọn bài trong cửa sổ app; tên bài đã chọn hiện phía trên.
[V] chọn video, [C] camera, [P/Space] dừng/phát, [R] phát lại, [T] đổi chế độ
xem kết quả, [S] lưu ảnh, [Q/Esc] thoát. Khi đổi trọng số cần tắt/mở lại app.

Nếu camera không có hình, kiểm tra ứng dụng Camera của Windows rồi đóng nó
trước khi thử lại. Có thể chọn camera khác bằng `--camera-id`.

## Cắt và phân tích lượt

Bộ cắt phải quan sát pha trước, chuyển động và pha trở về; thêm đệm đầu/cuối
để giảm hụt đoạn. Đoạn đầu/cuối dở dang hoặc nhún dưới ngưỡng có thể không tạo
lượt. Một lượt được đếm không đồng nghĩa đúng kỹ thuật.

High knees và butt kickers đếm độc lập từng chân: một chân nâng/co rồi hạ là
một lượt, trái rồi phải là hai lượt. Mỗi mẫu vẫn giữ đủ 17 khớp. Hai chân có
thể hoàn tất trong cùng khung xử lý; cả hai được phân tích và ghi nhật ký,
màn hình trực tiếp hiển thị kết quả gần nhất.

Video tải từ tệp được đọc hết thời lượng, lấy khớp khoảng 12 ảnh/giây ở bốn
bài chu kỳ cơ thể và 24 ảnh/giây ở hai bài chạy. Mỗi lượt đều nội suy về 64
thời điểm. Kết quả JSON giữ `rep_results` của mọi lượt; app xem trước lượt
cuối. Web cho chọn từng lượt để đối chiếu.

Luồng trực tiếp tìm người/khớp từng ảnh; đường video theo lô dùng hộp người
hợp nhất. Chúng không bảo đảm cho cùng tọa độ hoặc cùng số lượt. Chưa có
phép đo webcam thật nếu báo cáo chỉ ghi kiểm tra phát lại/tải tệp.

## Lưu JSON và ảnh không mở cửa sổ

```powershell
python smart_gym_test_rtmpose_v4/app.py --video "duong_dan/video.mp4" --exercise high_knees --headless --output "ket_qua.json" --snapshot "ket_qua.png"
```

Nhật ký camera/video phát trực tiếp được lưu trong `logs` của app.
Trọng số ONNX và contract (cấu hình nhãn/ngưỡng) phải đi cùng nhau trong
`weights`. Không trộn trọng số và ngưỡng từ hai lượt huấn luyện khác nhau.
Bản đóng gói `SmartGym` dùng thư mục `models/v4` để tìm tệp xác minh nếu
không có thư mục huấn luyện bên cạnh.

## Đọc kết quả

Mỗi nhãn có điểm và ngưỡng riêng. Các điểm không cộng thành 100% và chưa
được hiệu chuẩn thành xác suất kết luận đúng. Màu xanh/nhãn thuộc tính không
chứng minh toàn bộ động tác đúng. Không ghi hoặc không dự đoán nhãn lỗi
không có nghĩa đã xác minh không có lỗi.

Nhãn từng lượt được kế thừa toàn bộ từ video Qualcomm theo giả định giám sát
yếu. Chưa có nhãn lỗi riêng cho từng lượt được xác minh độc lập. Nhãn tốc độ
hoặc trạng thái toàn video có thể thiếu bằng chứng khi chỉ xem một lượt đã
chuẩn hóa thời gian. Nhãn không đủ mẫu dương train/validation vẫn giữ trong
danh mục nhưng hiện N/A, không tự chọn ngưỡng từ test.

Đối chiếu nhãn gốc trong app là so lượt đang hiển thị với nhãn video cha,
không phải chứng nhận nhãn từng lượt. Nhãn squat `knees over toes` có mâu
thuẫn giữa tên và mô tả nguồn; giao diện giữ ghi chú đó.

## Trọng số, dữ liệu dẫn xuất và báo cáo

Các đường dẫn dưới đây tính từ GYM:

- `stgcn_model_training/models/v4`: trọng số PTH/ONNX và contract đang dùng.
- `stgcn_model_training/models/v4/rep_no_context/<bài>`: trọng số theo lượt chạy.
- `stgcn_model_training/data/v4_rep_no_context/<bài>`: chia tập, nguồn nhãn,
  ranh giới lượt và tensor đã chuẩn bị; không sửa Dataset gốc.
- `stgcn_model_training/outputs/v4/rep_no_context/BAO_CAO_6_BAI.md`: tổng hợp.
- `stgcn_model_training/outputs/v4/rep_no_context/BAO_CAO_3_BAI_CON_LAI.md`:
  kết quả gập bụng ngược, high knees và butt kickers.
- Mỗi thư mục bài có loss, ma trận nhầm lẫn 2×2 từng nhãn, bảng F1/ngưỡng và
  `HUONG_DAN_ANH_BAO_CAO_<BAI>_V4.md`.

`stgcn_model_training` là liên kết tới `stgcn_squat_project`; hai đường dẫn
cùng dữ liệu. Chi tiết mọi bước và tham số nằm ở `QUY_TRINH.md` và
`QUY_TRINH_3_BAI_CON_LAI.md` trong thư mục kết quả.

Pipeline đang dùng là `train_pipeline/train_rep_no_context_v4.py`. Tùy chọn
`--exercises` chọn bài; `--resume` bỏ qua bài đã hoàn tất và tái dùng dữ liệu
đã chuẩn bị, không có nghĩa tự huấn luyện lại một bài đã xong. Các script
huấn luyện V4 ngữ cảnh trước đây không tạo ra cùng loại trọng số hiện tại.