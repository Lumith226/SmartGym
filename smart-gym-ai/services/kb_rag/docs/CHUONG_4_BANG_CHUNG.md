# Cách sử dụng phần KB và RAG trong Chương 4

**Bộ hồ sơ chuẩn bị báo cáo cập nhật 07/11/2026:** [nội dung chương, sơ đồ và bằng chứng Neo4j](../../../../CHUONG_4_BAO_CAO/index.html). Bộ này đối chiếu Chương 3 mới, runtime hội thoại mới và 311 nút/380 cạnh Neo4j. Các mục bên dưới là hướng dẫn lịch sử; đường backend nháp và số bộ kiểm thử cũ không mô tả luồng demo mới.

Tài liệu này là hướng dẫn lấy bằng chứng từ code đang có, chưa phải nội dung báo cáo thực nghiệm hoàn chỉnh.

Bản cập nhật dùng đầu ra model V4 thật qua video nằm tại [hướng dẫn V4](V4_KB_RAG_UPDATE.md). Dùng các file `artifacts/v4_live` cho luồng mới; các mẫu giả lập và file thử nghiệm phiên bản cũ bên dưới phải giữ đúng nhãn nguồn gốc và chế độ chạy.

## 1 Nguồn tri thức

Đưa bảng danh mục từ `sources.json` và trạng thái tải thật từ `artifacts/download_report_*.json`. Chỉ tính các nguồn đã xử lý có chunk; xem `artifacts/corpus_report.json`. Bản sách PDF OpenStax năm 2026 đã được thêm bởi người dùng và xử lý 84 trang đã đối chiếu mục lục. Nguồn Queensland là ghi chú có dẫn nguồn, phải ghi đúng hình thức thu thập.

## 2 Tiền xử lý và phân bố

Trình bày cách đọc PDF theo vị trí trang file, HTML theo từng bước thực hiện, loại bỏ navigation, chia đoạn tối đa 1500 ký tự với phần gối 200 ký tự. Báo cáo số nguồn, định dạng, số đoạn theo nguồn và theo tag bài tập, độ dài đoạn và trang cần OCR. Nói rõ đây là tham số thiết kế ban đầu, chưa phải cấu hình được chứng minh tối ưu.

## 3 Biểu diễn KB

In mẫu `artifacts/kb_sample.md` trong khoảng một trang, giải thích các cột. Dùng `artifacts/kb_graph.json` hoặc Neo4j để vẽ quan hệ `Exercise → TechniqueCriterion → Chunk ← Source`. Trình diễn truy vấn từ bài tập tới tiêu chí, đoạn bằng chứng và URL. Phân biệt tiêu chí đã kiểm tra anchor với việc đã được chuyên gia duyệt.

## 4 RAG kết nối KB

Chỉ ra `Retriever.search` trong `kb_service/retrieval.py`: lọc theo bài tập, xếp hạng lexical, truy xuất quan hệ hỗ trợ, tìm vector khi có chỉ mục và Ollama, rồi RRF. Chỉ ra `Generator.generate` trong `kb_service/providers.py`: gắn bằng chứng vào prompt, gọi model và kiểm tra cấu trúc trích dẫn. Trace phải phản ánh backend graph và các kênh thực sự dùng.

## 5 Mẫu IN–OUT

Dùng `examples/chat_request.json` để gọi `/v1/chat`; chụp đầu vào, danh sách chunk truy xuất, quan hệ graph và phản hồi. Mẫu `artifacts/example_in_out.json` mặc định chỉ là truy xuất với đầu vào giả lập; `artifacts/book_in_out.json` minh họa truy xuất từ sách có tên mục và số trang PDF. Muốn minh họa RAG sinh câu trả lời thật, phải cài model, tạo embedding rồi gọi với `generate:true`; ghi lại model, KB version và thời gian chạy. Không đổi nhãn `evidence_only` thành kết quả LLM.

Hai lần gọi HTTP với mô hình thật đã được lưu riêng trong `artifacts/book_rag_live.json` và `artifacts/exercise_rag_live.json`; xem tổng hợp tại `artifacts/live_verification.json`. Dùng những file này để minh họa đầu ra sinh bởi Qwen, đồng thời ghi rõ ví dụ quan sát chống đẩy là giả lập. Kết quả kiểm tra chỉ xác nhận service, model, chỉ mục và ID trích dẫn hoạt động; vẫn cần duyệt từng ý và đoạn trích tương ứng. Có thể chạy lại bằng `scripts/verify_live.py` khi service ở cổng 8010 đang chạy.

## 6 Thực nghiệm

Bộ 16 câu hiện có kiểm tra tìm đúng nguồn cho bốn bài, hai câu kiến thức nền từ sách và hai câu ngoài phạm vi. Dùng kết quả này để phát hiện lỗi, không quảng bá thành độ chính xác chung. Đồ thị hiện mô tả tiêu chí theo bài tập; câu hỏi giải phẫu chung sử dụng bằng chứng văn bản/vector, nên chế độ chỉ graph có thể không trả lời được chúng. Mở rộng bộ kiểm thử có câu hỏi, nguồn/trang chuẩn, ý trả lời cần có và trường hợp thiếu bằng chứng. Nhờ thành viên khác hoặc giảng viên duyệt trước khi đánh giá. Có thể so sánh lexical, graph và hybrid; chỉ so dense khi chỉ mục và mô hình thực sự sẵn sàng.

## 7 Microservice và ánh xạ thiết kế với code

Backend API → `backend/modules/kb_rag/client.py` → service `kb_service/app.py` → retrieval/graph/model. Các service có entrypoint và Dockerfile riêng, không chia sẻ import module nội bộ. Knowledge service chạy độc lập với mô hình động tác; nhận observation JSON đã thống nhất khi tích hợp. Chưa kiểm thử toàn luồng web với PostgreSQL/DL thật thì phải ghi đúng giới hạn đó.
