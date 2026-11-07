# Bàn giao web và dịch vụ tri thức SmartGym

Cập nhật 07/11/2026. Mục tiêu của nhánh bàn giao là cung cấp bản nháp FE/BE và toàn bộ mã KB/KG/RAG hiện tại để thành viên phụ trách web phát triển tiếp. Đây là bản mã nguồn, không phải bản triển khai đã đóng gói đủ dữ liệu và model trên một máy mới.

## Phần nào cần sửa và phần nào đang dùng

| Thư mục | Vai trò và hiện trạng |
|---|---|
| `frontend/` | Web nháp Next.js 16.3.8, React 19.2.8, TypeScript, Tailwind 4; cần làm lại giao diện và nối API thực tế. Dùng `package-lock.json` và `npm ci`. |
| `backend/` | Backend nháp FastAPI, SQLAlchemy/PostgreSQL, xác thực và session; còn placeholder AI. `routers/coach.py` đang gọi `/v1/chat` cũ, chưa chuyển đủ bốn chức năng chatbot mới. |
| `services/kb_rag/kb_service/` | Toàn bộ service chatbot hiện hành: lập kế hoạch câu hỏi, hội thoại, retrieval, Neo4j, LLM, kiểm tra nguồn và trình bày kết quả. API chính `POST /v1/chatbot`. |
| `services/kb_rag/claims.json` | Các tiêu chí kỹ thuật có anchor nguồn. |
| `services/kb_rag/sources.json`, `source_notes/` | Danh mục nguồn, URL, khoảng trang sách và ghi chú có dẫn nguồn để tái tạo KB. |
| `services/kb_rag/label_catalog_v4.json`, `label_knowledge_map.json`, `model_contracts/` | Ý nghĩa nhãn, ngưỡng và hợp đồng đầu ra model bốn bài. Không chứa trọng số model. |
| `services/kb_rag/tests/`, `evaluation/`, `examples/`, `scripts/`, `docs/` | Kiểm thử, bộ đánh giá phát triển, ví dụ, công cụ dựng KB/Neo4j và hướng dẫn tích hợp. |

Trong repository GitHub, mã vision/web V4 hiện có ở các thư mục cấp gốc như `smart_gym_web_v4/`, `smart_gym_test_rtmpose_v4/`; thư mục `smart-gym-ai/` được thêm cạnh chúng. Trên máy gốc, các thư mục vision nằm trong `D:\Đồ án\SmartGym-Model\`. Một số script minh chứng có đường dẫn hoặc giả định workspace của máy gốc; cần cấu hình lại nếu dùng các script đó trên máy mới. Không lấy đường dẫn tuyệt đối trong báo cáo làm cấu hình triển khai.

Web V4 hiện tại là nơi tham khảo luồng video → chatbot. Bản nháp FE/BE ở đây chưa thay thế web V4 và chưa được xác nhận chạy hoàn chỉnh từ đầu đến cuối.

## Dữ liệu không nằm trong Git

Không commit `.env`, token, `node_modules`, `.next`, runtime `.tools`, cache, log/ảnh/output hội thoại trong `artifacts`, PDF/HTML nguồn trong `data/raw`, corpus trong `data/curated` và index/vector trong `data/index`. Đây là cấu trúc loại trừ của dự án. **Mã KB/RAG, tiêu chí và manifest vẫn được đưa lên đầy đủ**; corpus/index cần được dựng lại từ tài liệu gốc. Không đăng toàn văn sách hoặc dữ liệu video lên Git để thay cho bàn giao mã nguồn.

Để khôi phục đúng mốc KB của máy gốc, cần bảy tài liệu đúng phiên bản. Sách bắt buộc của bản có PDF:

- Tên: Anatomy and Physiology 2e, OpenStax. Trang nguồn: https://openstax.org/details/books/anatomy-and-physiology-2e.
- Lưu vào `services/kb_rag/data/raw/anatomy-and-physiology-2e_-_WEB.pdf`.
- Bản đang dùng: 1.347 trang; SHA256 `aa2e577b2083c343f4d57b38f00dd935dd2d98befdb38c0f368d72d636d0ff46`.
- `sources.json` chọn 84 trang thành 171 đoạn. Nếu tải bản sách khác, cần kiểm tra lại mục lục và map trang; không bỏ kiểm tra phiên bản để chạy cho qua.
- Ghi công: Access for free at openstax.org. Metadata của bản này ghi CC BY-NC-SA 4.0; giữ điều kiện sử dụng và ghi công khi xử lý/chia sẻ.

Năm trang HTML ACE/NASM được khai báo URL và tên tệp trong `sources.json`; lệnh fetch tải chúng khi nguồn cho phép. Ghi chú Queensland được chuẩn bị từ `source_notes`. NSCA là nguồn tùy chọn chưa có tệp, không tính vào KB đã xử lý. Nếu tải lỗi hoặc nội dung web thay đổi, bổ sung tài liệu hợp lệ rồi kiểm tra báo cáo ingest. Không tuyên bố đã phục hồi 311 nút/380 cạnh nếu kết quả thực tế khác.

## Chạy riêng KB/RAG trên Windows

Mở PowerShell ở thư mục `smart-gym-ai` của bản clone:

```powershell
powershell -ExecutionPolicy Bypass -File .\services\kb_rag\scripts\bootstrap.ps1
Copy-Item .\services\kb_rag\.env.example .\services\kb_rag\.env
ollama pull qwen3:8b
ollama pull qwen3-embedding:0.6b
```

Cần cài và chạy Ollama trước các lệnh pull. Điền cấu hình riêng trong `.env`; không commit tệp này. Sau khi bổ sung PDF đúng bản:

```powershell
powershell -ExecutionPolicy Bypass -File .\services\kb_rag\scripts\prepare.ps1
powershell -ExecutionPolicy Bypass -File .\services\kb_rag\scripts\run.ps1
```

Kiểm tra `http://127.0.0.1:8010/health` và `http://127.0.0.1:8010/docs`. HTTP 200 ở health chưa đủ: `kb_ready` phải là `true`. Muốn chat sinh ngôn ngữ cần Ollama/model thật; `generate:false` chỉ kiểm tra bằng chứng, không chứng minh LLM đã chạy. Không cần dataset huấn luyện vision để hỏi kiến thức.

Neo4j tùy chọn cho local retrieval; muốn dùng Neo4j thật:

```powershell
docker compose -f docker-compose.kb.yml up -d neo4j
.\.tools\python\python.exe -X utf8 -m kb_service.cli sync-neo4j
```

Đặt `KB_GRAPH_BACKEND=neo4j`, URI/user/password đúng trong `.env` của service và khởi động lại. Browser ở `http://127.0.0.1:7474`. Các câu Cypher nằm trong `services/kb_rag/examples/`. Các lệnh trên dùng cấu hình dev; mật khẩu trong example là giá trị mẫu. Không đưa mật khẩu thật hoặc token của môi trường triển khai vào source.

## Hợp đồng cần giữ khi làm web mới

Luồng mong muốn: FE → backend xác thực của ứng dụng → KB/RAG qua HTTP. Backend lưu và xác minh kết quả video; service tri thức không nạp model vision. Không đưa `KB_INTERNAL_TOKEN` hoặc API key lên biến `NEXT_PUBLIC_*`.

`POST http://127.0.0.1:8010/v1/chatbot` dùng `ChatbotRequest` trong `kb_service/chatbot.py`:

```json
{
  "message": "Tôi nên giữ thân người thế nào khi chống đẩy?",
  "task": "knowledge",
  "records": [],
  "conversation": [],
  "generate": true
}
```

`task` có bốn giá trị `knowledge`, `score`, `summary`, `practice`. Ví dụ này minh họa schema gọi API, không phải câu trả lời mẫu được thêm vào KB.

- Khi hỏi về video, gửi `records`: `observation_id`, `source_id`, `model_result` đầy đủ và `simulated`. Đối chiếu model contract và schema API trước khi tạo request; không tự chế nhãn hoặc chỉ gửi tên lỗi.
- `conversation` chứa các lượt `{role, content}`. `video_context.state` nhận `none`, `selected`, `analyzing`, `analyzed`, `attached`. Chọn file chưa đồng nghĩa đã phân tích hoặc đã gắn kết quả.
- Backend dùng `source_id`/hash video ổn định để không đếm upload trùng thành nhiều quan sát. Không nhận `simulated:false` từ client làm bằng chứng dữ liệu đáng tin; cần xác minh kết quả đã lưu của người dùng.
- Chấm điểm cần `rules` và `scoring_policy` có tên/phiên bản; sigmoid/ngưỡng model không phải số điểm bị trừ. Dự án chưa có thang điểm chuyên môn chính thức.
- Đọc response thật/schema OpenAPI và `kb_service/presentation.py` để dùng tham chiếu dễ đọc `references`; không chép ID chunk thô vào lời chat. Giữ ID/trace trong JSON và phần kỹ thuật cho việc kiểm tra nguồn.
- Bốn bài: squat, chống đẩy, jumping jack, reverse crunch. Mã `situp` của pipeline V4 là reverse crunch; không đổi nghĩa thành sit-up.

Backend nháp hiện có `CoachResponse` và `coach_response()` cho endpoint cũ; cần chủ động thêm gateway `/v1/chatbot` và cập nhật DTO/UI để giữ đủ session, references, trace và trạng thái video. Không chỉ đổi URL rồi giữ nguyên response model cũ vì có thể mất trường.

## Chạy FE/BE nháp để phát triển

Backend: dùng Python virtualenv riêng, `pip install -r requirements.txt`, copy `.env.example` thành `.env`, cấu hình PostgreSQL và JWT secret, chạy `uvicorn main:app --reload --port 8000` trong `backend/`. Xem `backend/main.py` và `/docs` để đối chiếu route thực tế. Phần xử lý AI trong session vẫn còn placeholder.

Frontend: trong `frontend/`, copy `.env.example` thành `.env.local`, chạy `npm ci`, rồi `npm run dev` (cổng 3000). Chưa xác nhận build FE hoặc tích hợp FE/BE nháp trong đợt bàn giao này.

Không chạy `docker-compose.yml` cũ một cách mặc định bên cạnh web V4: ChromaDB ở cổng 8001 có thể xung đột API video 8001. RAG hiện hành dùng vector JSON cục bộ, không cần ChromaDB. Compose toàn bộ còn tham chiếu Dockerfile frontend chưa có trong bản nháp; người phụ trách FE/BE cần hoàn thiện khi đóng gói triển khai. Dùng hướng dẫn native/compose KB riêng ở trên để kiểm tra service tri thức trước.

## Kiểm thử và giới hạn cần giữ

```powershell
.\.tools\python\python.exe -X utf8 -m unittest discover -s services/kb_rag/tests -v
```

Các kiểm thử unit dùng fixture/mock; không thay thế kiểm tra Ollama, Neo4j và video thật. Tài liệu lịch sử có thể nhắc artifacts/log nằm trên máy gốc, chưa được upload trong nhánh này. Mốc phát triển trước bàn giao: 44/44 lượt đạt tiêu chí hành vi do người phát triển rà soát; không phải chứng nhận chuyên môn. KB mốc có 194 đoạn, 23 tiêu chí, 83 nhãn; 8 lỗi có liên kết trực tiếp, 13 một phần và 2 chưa có. Một ví dụ PDF còn hạn chế về citation; chưa có đánh giá độc lập toàn diện hoặc benchmark nóng/nguội P50/P95.

Khi thay UI/backend, kiểm tra lại bốn chức năng, câu hỏi nối tiếp/đổi chủ đề, nguồn [1]/[2], video chưa gắn, video thiếu quan sát, upload trùng, timeout và chính sách điểm. Không đổi thông báo thiếu căn cứ thành lời khuyên chắc chắn để làm demo trông tốt hơn.

Quy tắc Chương 4 được giữ ở `../CHUONG_4_KG_RAG_RULES_PLAN.md` từ thư mục này. Đọc trước khi sửa KB/KG/RAG/chatbot. Không dùng các README cũ làm quy tắc cạnh tranh.
