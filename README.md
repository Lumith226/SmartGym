# SmartGym — Web, KB/KG/RAG và chatbot

Bản bàn giao tích hợp giao diện Next.js, BFF, sáu backend NestJS và dịch vụ Python KB/RAG. **Không kèm code hoặc trọng số model tư thế**; API/contract và phần kết nối tới provider riêng vẫn được giữ. KB hỗ trợ tri thức sáu bài tập.

Hướng dẫn chính: [Bàn giao và chạy trên máy khác](docs/guides/BAN_GIAO_CHAY_MAY_KHAC.md).

## Chạy nhanh

Chuẩn bị Docker Desktop, Git/OpenSSL, Node.js24 và Ollama. Tải hai model ngôn ngữ/embedding qua Ollama, sau đó:

```powershell
ollama pull qwen3.5:9b
ollama pull qwen3-embedding:0.6b
node scripts/setup-integrated.mjs
node scripts/start-integrated.mjs --build
```

Mở **https://127.0.0.1:3100/hoi-dap**. Script sinh cấu hình riêng cho từng máy; không commit `.env` hoặc `.local`. Khi mới clone, chat kiến thức chạy độc lập với video. Bật video bằng provider riêng theo hướng dẫn bàn giao.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `frontend/` | Giao diện, BFF, nguồn tham khảo và kết nối kết quả video |
| `backend/apps/` | Identity, Catalog, Workout, Progress, Notification, Pose |
| `services/kb_rag/` | Toàn bộ mã KB/RAG, contract, fixture, snapshot/vector R3 và Cypher |
| `infra/` | Docker Compose, Dockerfile và wrapper triển khai |
| `scripts/` | Thiết lập, chạy, kiểm tra hợp đồng và tiện ích phát triển |
| `docs/` | Hướng dẫn bàn giao, API, kiến trúc, quyết định thiết kế và giới hạn |

## Dữ liệu và trạng thái

KB `kb_ddae6f149e7b9f57`:12 hồ sơ,284 đoạn,38 tiêu chí,468 nút,567 cạnh. Neo4j được khôi phục từ bản Cypher đã đóng gói, không cần tải lại sách hoặc chạy embedding. [Nguồn và quyền sử dụng](docs/THIRD_PARTY_NOTICES.md).

Lượt119 câu đã lưu trước bàn giao:83 đạt,10 giới hạn hợp lệ,26 cần sửa qua rà phát triển. [Giới hạn hiện có](docs/KNOWN_LIMITATIONS.md). Không mô tả chatbot là đã trả lời đúng mọi câu hỏi. [Các kiểm tra đóng gói thực tế](docs/handoff-verification.json).

Các báo cáo Word, PDF lớn, dataset, tài khoản/video, khóa bí mật và môi trường Python/Node cài sẵn không được đẩy lên. Nhật ký kế hoạch và rà soát cũ đã được lược bỏ; giữ tài liệu API/thiết kế cần cho thành viên phát triển. Nhánh gốc `SmartGym_Web` và các nhánh model được giữ riêng.
