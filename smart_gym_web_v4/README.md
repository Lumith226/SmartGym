# Smart Gym Web V4 — chạy local

## Sáu bài theo lượt, không ngữ cảnh

Squat, chống đẩy, jumping jacks, gập bụng ngược, high knees và butt kickers
nhận từng lượt đã hoàn thành từ bộ cắt SciPy;
ST-GCN++ chỉ nhận skeleton, không nối vector ngữ cảnh. Camera hiển thị kết quả
lượt gần nhất. Sau khi tải video lên và phân tích, ô chọn lượt cho phép xem
kết quả cùng mốc thời gian từng lượt; nút Lưu JSON giữ cả danh sách kết quả.

Vẫn chạy server và web bằng hai lệnh/bat riêng như dưới đây. Khởi động lại
server cũ sau khi thay trọng số.
Nhãn từng lượt được kế thừa từ video nguồn, không phải nhãn đã gán riêng cho
mỗi lượt. Không coi kết quả phát lại tệp là đo độ trễ webcam thật.

Bản web dùng lại mô hình trong `../smart_gym_test_rtmpose_v4/weights`. Không sao chép hoặc thay trọng số và ngưỡng. Camera được mở bởi trình duyệt trên máy người dùng; server (máy chủ) không mở webcam bằng OpenCV.

Hai lựa chọn bổ sung là **High knees — nâng cao gối (31 nhãn)** và **Butt kickers — gót chạm mông (14 nhãn)**. Web hiển thị sáu lựa chọn, phím tắt **1–6**; bài chưa có trọng số được xác minh sẽ hiện trạng thái đang chuẩn bị và bị khóa. Các bài đang có vẫn dùng được trong thời gian chuẩn bị.

Server kiểm tra mô hình mới khi web làm mới danh mục mỗi 10 giây. Khi trọng số, cấu hình nhãn và kết quả xác minh có cùng mã kiểm tra nội dung, bài mới tự được nạp mà không đặt lại phiên tập hiện tại. Nếu đang chạy server từ trước lần cập nhật mã này, cần khởi động lại một lần để dùng cơ chế mới.

Với hai bài chạy, mỗi chân nâng/co rồi hạ là một lượt; trái rồi phải là hai lượt.
Mỗi mẫu vẫn giữ đủ 17 khớp. Ô chọn lượt hiện chân trái/phải và tua tới lượt
được chọn. Không dùng số đếm này để tự gán nhãn lỗi hoặc thay thế quy ước tốc
độ của nguồn. Mô hình chỉ nhận skeleton 3×64×17, không nhận vector ngữ cảnh.

## Hai phần chạy riêng

| Phần | Thư mục | Địa chỉ mặc định | Nhiệm vụ |
|---|---|---|---|
| **SERVER AI** | `server` | `http://127.0.0.1:8001` | Python, tìm khớp RTMPose, đếm lượt, chạy ST-GCN++ ONNX |
| **WEB** | `web` | `http://localhost:8080` | Mở camera/video, hiển thị hình, vẽ khớp và bảng kết quả |

Server và web đều chỉ lắng nghe trên máy local. Chưa cấu hình truy cập từ máy/điện thoại khác hoặc Internet.

## 1. Cài phần bổ sung cho server

Dùng đúng Python/môi trường đã chạy được bản test V4. Từ thư mục gốc `GYM`:

```powershell
python -m pip install -r smart_gym_web_v4/server/requirements.txt
```

Thư viện AI tiếp tục sử dụng môi trường của `smart_gym_test_rtmpose_v4`. Nếu cài trên máy khác, cần chuẩn bị môi trường AI và toàn bộ trọng số trước; bốn thư viện trên không thay thế PyTorch, ONNX Runtime, rtmlib và OpenCV.

## 2. Chạy SERVER AI — cửa sổ PowerShell thứ nhất

```powershell
cd D:\1.E22CQCN03-B\GYM\smart_gym_web_v4
python -m server.app --device auto --port 8001
```

`auto` chọn GPU CUDA nếu môi trường hỗ trợ, hoặc CPU. Có thể chỉ định `--device cuda` hoặc `--device cpu`. Server nạp bộ tìm người, tìm khớp và bốn mô hình khi khởi động; chờ hoàn tất trước khi kiểm tra web.

Kiểm tra trạng thái tại `http://127.0.0.1:8001/api/health`: `ready: true` nghĩa là mô hình đã sẵn sàng. Tài liệu API tại `http://127.0.0.1:8001/docs`.

## 3. Chạy WEB — cửa sổ PowerShell thứ hai

```powershell
cd D:\1.E22CQCN03-B\GYM\smart_gym_web_v4
python web/serve.py --port 8080
```

Mở **http://localhost:8080** bằng Chrome hoặc Edge. Không mở trực tiếp tệp HTML bằng cách nhấp đúp. Giữ cả hai cửa sổ chạy; Ctrl+C để dừng từng phần.

Cũng có thể nhấp đúp `run_server.bat` và `run_web.bat` nếu lệnh `python` trên máy trỏ đúng môi trường. Hai tệp này chạy riêng, không tự cài thư viện.

Nếu bản local đang được chạy nền sẵn, mở web trực tiếp; không chạy thêm bản thứ hai trên cùng cổng. `stop_local.bat` dừng đúng các tiến trình chạy nền được ghi nhận trong `runtime/local_processes.json`. Các cửa sổ khởi chạy thủ công bằng hai lệnh trên vẫn dừng bằng Ctrl+C.

## Sử dụng camera

1. Chọn bài. Cả bốn bài dùng V4 nhiều nhãn: squat 14, chống đẩy 21, jumping jacks 29, gập bụng ngược 19.
2. Chọn **Camera → Mở camera**, cấp quyền trong trình duyệt.
3. Có thể chọn lại thiết bị trong danh sách camera sau khi cấp quyền. Camera ảo cũng có thể xuất hiện trong danh sách.
4. Bấm **Bắt đầu phân tích**. Hình camera phát trực tiếp tại trình duyệt; server nhận ảnh JPEG và trả khớp/kết quả.
5. **Dừng phân tích** ngừng gửi hình nhưng giữ kết quả cuối. **Đặt lại** xóa bộ đếm và kết quả đoạn trực tiếp. Đổi bài xóa kết quả bài cũ.

Nếu camera không mở được, kiểm tra quyền truy cập và thử camera trong ứng dụng Camera của Windows; đóng ứng dụng đó trước khi thử lại. Bản web không thể khắc phục lỗi phần cứng hoặc trình điều khiển camera.

## Sử dụng tệp video

- Chọn **Tệp video → Chọn video**. Trình duyệt tự phát video tại máy. MP4/H.264 hoặc WebM thường phù hợp; định dạng server đọc được chưa chắc trình duyệt phát được.
- **Bắt đầu phân tích**: xử lý theo thời gian phát, hiển thị khung xương và đếm lượt. Bảng cập nhật sau lượt hoàn thành, không phải nhãn của từng khung ảnh.
- **Phân tích video**: gửi tệp tối đa 200 MB để server đọc hết thời lượng, cắt và phân tích từng lượt. Có cho cả sáu bài. Khi phân tích, theo dõi trực tiếp được dừng và video được tạm dừng.
- Bấm **Các lượt trong video**, chọn lượt để đọc kết quả và tua tới thời điểm của lượt, hoặc **Lượt trực tiếp** để xem kết quả phiên đang theo dõi. Lưu JSON giữ toàn bộ danh sách lượt.
- Tua video khi đang phân tích sẽ đặt lại phiên theo dõi để tránh nối hai đoạn chuyển động không liên tục.
- Tệp upload được xử lý trong thư mục tạm và xóa khi hoàn tất. Kết quả và ảnh chỉ tải về khi bấm nút lưu.

## Cách đọc kết quả

- Điểm được so với ngưỡng cố định trong tệp cấu hình, không chỉnh ngưỡng trên web.
- **Màu cam:** nhãn lỗi được dự đoán. **Màu xanh:** thuộc tính/trạng thái được dự đoán; không phải khẳng định kỹ thuật đúng.
- **N/A:** chưa đủ mẫu để chọn ngưỡng hoặc thiếu dữ liệu quan sát.
- Điểm không cộng thành 100%; chưa được hiệu chuẩn thành xác suất kết luận đúng.
- Nhãn chưa xuất hiện không chứng minh toàn bộ động tác đúng. Nhãn lượt kế thừa từ video nguồn; chưa có nhãn lỗi từng lượt được xác minh độc lập. Nhãn tốc độ/trạng thái toàn video có thể thiếu bằng chứng khi nhìn riêng một lượt.

## FPS và độ trễ

- **FPS hình ảnh:** tốc độ video đang được trình duyệt trình bày.
- **FPS phân tích:** số kết quả xử lý khung nhận được mỗi giây, tính trên đoạn gần đây.
- **Độ trễ kết quả:** thời gian từ lấy hình tại trình duyệt đến khi nhận kết quả tương ứng, gồm nén, truyền và xử lý.
- Không vẽ cả bảng thành ảnh tại server. Một tab chỉ giữ một yêu cầu khung đang chờ, tốc độ gửi tối đa 25 lần/giây; không tích lũy video chậm dần.
- Khớp được vẽ lên hình hiện tại có thể trễ một khoảng bằng thời gian xử lý. Nếu kết quả đã cũ quá 500 ms thì ngừng vẽ khớp đó. Chưa giữ hình camera trong bộ đệm để ghép chính xác từng khung.
- Server dùng chung mô hình và xử lý GPU tuần tự; trạng thái người tập và bộ đếm tách riêng từng kết nối. Giới hạn 4 kết nối là giới hạn của bản thử nghiệm, không phải cam kết 4 phiên thời gian thực.

## API và giao thức

- `GET /api/health`: trạng thái và các cơ chế thực thi mô hình.
- `GET /api/exercises`: bài tập, phiên bản, nhãn và ngưỡng.
- `WS /ws/live`: kết nối phân tích khung.
- `POST /api/analyze-video`: form gồm `exercise` và `file` để phân tích toàn video.

WebSocket trước tiên nhận JSON: `{"type":"configure","exercise":"squat","source":"camera","generation":1}`. Server trả `ready`. Mỗi khung là một gói nhị phân: 4 byte little-endian độ dài JSON → JSON UTF-8 có `frame_id`, `timestamp` (giây của nguồn video), `generation` → ảnh JPEG. Chỉ gửi khung tiếp khi đã nhận kết quả hoặc lỗi của khung trước. Đổi bài/tua video tạo generation mới; web bỏ kết quả của phiên cũ.

Đổi cổng web phải cấu hình origin (địa chỉ web được phép kết nối) trước khi chạy server. Ví dụ:

```powershell
$env:GYM_WEB_ORIGINS="http://localhost:8082,http://127.0.0.1:8082"
python -m server.app --device auto
```

Đổi cổng server thì bấm biểu tượng bánh răng trên web, nhập địa chỉ mới rồi **Áp dụng**.

## Kiểm thử

Từ thư mục `smart_gym_web_v4`:

```powershell
python -m pytest tests -q
```

Bản này không huấn luyện hoặc tinh chỉnh mô hình, không tự gán nhãn và không thay thế thư mục test Python hiện có.

Sau khi huấn luyện hoặc thay trọng số, khởi động lại SERVER AI để nạp mô hình và cấu hình ngưỡng mới. API `/api/exercises` cho biết số nhãn thực tế đã nạp; thiếu trọng số hoặc cấu hình V4 sẽ báo mô hình chưa sẵn sàng, không tự chuyển về bản bốn lớp.
