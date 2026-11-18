# Giới hạn của bản bàn giao

- FE/BFF/backend và KB/RAG được đóng gói cùng repository. Model tư thế, dataset và dữ liệu tài khoản/video không nằm trong bản này theo yêu cầu người dùng.
- Tri thức sáu bài: Squat, Jumping Jack, Chống đẩy, Reverse Crunch, High Knees, Butt Kickers. Điều này không đồng nghĩa đường vision của cả sáu bài đã được nghiệm thu.
- KB R3 `kb_ddae6f149e7b9f57`:12 hồ sơ nguồn,284 đoạn,38 tiêu chí,468 nút,567 cạnh,128 nhãn. Bộ module RAG được sao chép từ bản đang tích hợp; wrapper triển khai nằm ngoài package để giữ fingerprint của phương pháp.
- Lượt đã lưu `run_20261118T065753Z`:119HTTP200;113 ca cơ học;83 đạt/10 giới hạn hợp lệ/26 cần sửa qua rà phát triển. 26 ca gồm12 từ chối/thiếu ý,9 lỗi nghĩa/phạm vi/dẫn chứng và5 lặp/thừa. Không phải đánh giá độc lập của chuyên gia.
- Độ trễ đã ghi trước bàn giao: trung vị19,195s, P9543,405s trên toàn119 câu; khác máy/phần cứng/provider có thể khác. Không chạy lại119 câu chỉ để đóng gói/push.
- Whole-video V4 chưa cung cấp repCount đáng tin cậy; khoản trừ phải null khi chưa có scoring policy. Nhãn dự đoán không xác nhận cơ yếu, bệnh lý hoặc toàn bộ tư thế đúng.
- Nhánh knowledge có trường hợp từ chối dù có thể diễn giải hữu ích; practice có trường hợp nói có gợi ý nhưng danh sách rỗng trên video thật. HTTP200 không thay kiểm tra nội dung.
- Chưa có consumer cập nhật tự động Catalog→KB, rollback toàn stack, benchmark tải hoặc kiểm tra OAuth/camera trên máy nhận.
- Bản chuẩn bị Compose/khôi phục KB cần được kiểm tra trên máy nhận. Các kiểm tra thực thi của đợt đóng gói được ghi ở `docs/handoff-verification.json`; không thay bằng tuyên bố tất cả chức năng đã chạy trên mọi máy.
