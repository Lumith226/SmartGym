# Giải thích giao diện bốn bài V4

Squat hiển thị 14 hàng nhãn; chống đẩy 21 hàng; jumping jacks (bật nhảy dang tay chân) 29 hàng; gập bụng ngược 19 hàng khi đủ trọng số V4. Một video có thể được dự đoán nhiều hàng cùng lúc.

## Video và khung xương bên trái

Pose (khung xương ước lượng) có 17 điểm. Màu đường nối và điểm chỉ minh họa vị trí khớp, không đánh dấu khớp đúng/sai. Rep (lượt lặp động tác) là số chu kỳ tìm được, không phải số lượt đúng kỹ thuật. FPS — frames per second (số khung hình mỗi giây) là tốc độ xử lý/hiển thị, không phải độ chính xác.

READY (sẵn sàng): chờ chuyển động. IN_REP (đang trong lượt): đang thu thập khớp. CHỜ TOÀN THÂN: chưa thấy đủ khớp. HẾT VIDEO: đã phát hết và tự tạm dừng. Khi tạm dừng, ứng dụng không phân tích thêm khung hình.

## Bảng nhãn bên phải

| Cột | Cách hiểu |
|---|---|
| Tên nhãn | Chú thích Qualcomm: lỗi, thuộc tính hoặc trạng thái |
| Điểm | Điểm độc lập qua sigmoid (hàm đưa điểm về khoảng 0–1) |
| Ngưỡng | Threshold (ngưỡng quyết định), chọn riêng từ tập xác thực |
| AI | Có: dự đoán nhãn; “—”: chưa dự đoán; N/A: thiếu ngữ cảnh hoặc mẫu xác thực |
| Nhãn gốc | Có: Qualcomm ghi nhãn; “—”: không ghi; “?”: chưa xác minh nhãn gốc |

Điểm/ngưỡng làm tròn trên giao diện; JSON (tệp dữ liệu có cấu trúc) lưu giá trị chính xác và lý do trạng thái. Ngưỡng nội bộ 1,01 vô hiệu hóa báo có khi thiếu mẫu dương, không phải điểm tin cậy 101%.

Điểm của các hàng không cộng thành 100%. Điểm 90% chưa được hiệu chuẩn để hiểu là kết luận đúng 90%. Dấu “—” không xác nhận tiêu chí đã đạt.

## Màu các hàng và nhãn gốc

| Màu | Ý nghĩa |
|---|---|
| Xanh | Mô hình dự đoán có nhãn; nhãn đó vẫn có thể là một lỗi |
| Vàng | Qualcomm có nhãn nhưng mô hình chưa dự đoán |
| Đỏ | Mô hình dự đoán nhãn không được Qualcomm ghi |
| Xám | Chưa dự đoán nhãn |

Nhãn gốc chỉ đối chiếu sau suy luận, không truyền vào mô hình. SHA-256 (mã kiểm tra nội dung) giúp tìm nhãn khi video nguyên nội dung bị đổi tên. Video ngoài dữ liệu có thể hiển thị “?”.

Tên tệp benchmark như `CORRECT` (nhóm đúng cũ) hoặc `ARMS_INCOMPLETE` (nhóm tay chưa đủ biên độ cũ) không quyết định nhãn chuẩn. Bảng đối chiếu dùng đầy đủ chú thích JSON khớp nội dung; một video trong nhóm tên cũ vẫn có thể có nhiều thuộc tính hoặc lỗi khác.

“Khớp toàn bộ: CÓ” nghĩa là dự đoán đúng danh sách chú thích, không có nghĩa người tập đúng kỹ thuật. Video có nhiều lỗi vẫn khớp toàn bộ khi AI nhận đúng các lỗi đó.

## Phạm vi đánh giá

Khi mở video, ứng dụng phân tích cả đoạn trước rồi mới phát. Bảng toàn video giữ nguyên khi hình ảnh thay đổi. Bấm T để xem lượt vừa hoàn thành và bấm lại để trở về toàn video.

Camera (máy quay trực tiếp) dùng cửa sổ chuyển động gần đây. Các nhãn cần ngữ cảnh cả đoạn không áp dụng ở đây: giữ tư thế/bắt đầu muộn của squat; tốc độ, chỉ làm một lần và dừng sớm của jumping jacks.

Mô hình học từ chú thích toàn video. Kết quả từng lượt/cửa sổ là chế độ quan sát bổ sung, chưa có đánh giá chuẩn theo nhãn từng lượt.

“Khung hình có pose dùng được” là tỷ lệ khung mẫu thấy đủ khớp, không phải độ chính xác. Thời gian ONNX (bộ chạy mô hình) chỉ tính phân loại khớp, chưa gồm đọc video, phát hiện người, tìm khớp và vẽ giao diện.

## Nhãn cần chú ý

ROM — range of motion (biên độ vận động) giữ nguyên mức Qualcomm, không tự quy đổi thành độ góc hoặc mức đạt chuẩn. Speed (tốc độ) có đơn vị rps — repetitions per second (số lần lặp mỗi giây), là nhãn dự đoán toàn video.

Squat `knees over toes` có tên và mô tả gốc trái nghĩa; giao diện giữ mã và ghi chú mâu thuẫn. Một số nhãn jumping jacks chỉ có 1–2 video: cần đọc số mẫu và trạng thái thiếu dữ liệu trong báo cáo.

## Điều khiển

V chọn video; C mở máy quay; P/Space dừng/tiếp tục; T đổi phạm vi; R phát lại và xóa bộ đếm; 1–4 chọn bài; S lưu ảnh; Q/Esc thoát. Sau khi huấn luyện mới, mở lại ứng dụng để nạp đúng trọng số và ngưỡng.

Bốn nút phía trên hình ảnh cũng cho phép chọn bài bằng chuột. Nút đang chọn có màu xanh; dòng **ĐANG CHỌN [số]: tên bài** luôn cho biết bài hiện tại. Phím số chỉ có tác dụng khi cửa sổ V4 đang được chọn. Số 1 là squat; số 2 chống đẩy; số 3 jumping jacks (bật nhảy dang tay chân); số 4 gập bụng ngược. Chọn bài sẽ xóa kết quả của bài trước và phát lại video từ đầu. Với cả bốn bài V4, thông báo đang phân tích xuất hiện trước bước tính lại toàn video.

Chống đẩy và gập bụng ngược V4 cũng có bảng toàn video. Tốc độ, dừng sớm, vào tư thế hoặc đầu ra vào khung hình có thể cần ngữ cảnh toàn video; ở đoạn ngắn các hàng này hiển thị N/A. Các mức độ cao của gập bụng ngược giữ theo thang nguồn, không tự quy đổi sang centimét. Hãy dùng video đúng bài đang chọn để kiểm tra.

**ĐANG MỞ CAMERA**: đang kết nối máy quay. **LỖI CAMERA**: chưa nhận được hình; không có kết quả nhận diện mới. Thao tác chọn bài vẫn dùng được trong cả hai trạng thái. Bấm C để thử lại, V để chọn video. Việc chọn bài không sửa lỗi kết nối camera. Khi cập nhật mã chương trình, cần đóng cửa sổ V4 cũ và chạy lại để dùng giao diện mới.
