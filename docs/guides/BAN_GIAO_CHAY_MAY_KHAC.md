# Bàn giao SmartGym Web và KB/RAG

Bản này đóng gói FE Next.js, BFF, sáu backend NestJS và dịch vụ KB/KG/RAG hiện có. Code và trọng số model nhận diện/phân tích tư thế được quản lý riêng theo yêu cầu của nhóm. Các JSON trong `services/kb_rag/model_contracts` là hợp đồng dữ liệu để kiểm tra kết quả model, không phải trọng số.

## 1. Lấy đúng nhánh

```powershell
git clone --branch SmartGym_Integrated --single-branch https://github.com/Lumith226/SmartGym.git
cd SmartGym
```

Chuẩn bị Docker Desktop đang chạy (hoặc Docker Engine với Compose từ 2.24.4), Git, Node.js 24 và OpenSSL. Trên Windows có Git for Windows ở vị trí mặc định, bộ cài tự dùng OpenSSL đi kèm Git. Nếu cài ở nơi khác, đặt biến `OPENSSL_BINARY` trỏ tới `openssl.exe`. Cần Internet cho lần tải image/thư viện đầu tiên. Với cấu hình chatbot hiện tại, ưu tiên RAM32GB và GPU8GB; CPU vẫn có thể chạy nhưng chậm hơn. Không cần dataset huấn luyện hoặc camera để hỏi kiến thức.

## 2. Chuẩn bị Ollama

Cài và mở Ollama trên máy nhận, sau đó chạy:

```powershell
ollama pull qwen3.5:9b
ollama pull qwen3-embedding:0.6b
```

Tag embedding phải giữ đúng `qwen3-embedding:0.6b` vì vector trong bản bàn giao được tạo bằng model này. Không đổi sang `nomic-embed-text` khi vẫn dùng vector đã đóng gói. Đổi model chat cần kiểm tra lại chất lượng; không coi kết quả119 câu cũ là kết quả của model mới.

Mặc định RAG trong Docker gọi `http://host.docker.internal:11434`. Với Linux, Ollama phải lắng nghe ở địa chỉ mà Docker truy cập được; có thể cấu hình `OLLAMA_HOST=0.0.0.0:11434` trong tiến trình Ollama và giới hạn truy cập bằng cấu hình mạng của máy. Nếu dùng server Ollama khác, sửa `SMARTGYM_OLLAMA_ORIGIN` trong `.env` sau bước thiết lập.

## 3. Tạo cấu hình mới và chạy

```powershell
node scripts/setup-integrated.mjs
node scripts/start-integrated.mjs --build
```

Hoặc chạy `Chay-SmartGym.cmd --build` trên Windows. Không sao chép `.env` và `.local` từ máy thành viên. Script sinh mật khẩu database, token và CA/chứng chỉ mới; các file này được Git ignore. Script kiểm hash snapshot/Cypher, giữ nguyên release KB, không tự thu thập lại hoặc sinh vector mới.

Địa chỉ sau khi chạy:

| Thành phần | Địa chỉ |
|---|---|
| Web và chatbot | https://127.0.0.1:3100/hoi-dap |
| Hộp thư xác minh local | http://127.0.0.1:8025 |
| Neo4j Browser | http://127.0.0.1:7475 |
| Neo4j Bolt cho Browser | bolt://127.0.0.1:7688 |

HTTPS dùng chứng chỉ CA local do bộ cài tạo. Trình duyệt có thể yêu cầu xác nhận chứng chỉ local. Tài khoản Neo4j là `neo4j`; mật khẩu ở `NEO4J_PASSWORD` trong `.env` vừa tạo. Không gửi file này vào Git. Không mở thêm hai stack cùng dùng port3100/8025 trên một máy.

Kiểm tra cấu hình và trạng thái:

```powershell
docker compose -p smartgym-integrated --env-file .env -f infra/compose.yaml -f infra/compose.integrated.yaml config --quiet
docker compose -p smartgym-integrated --env-file .env -f infra/compose.yaml -f infra/compose.integrated.yaml ps
docker compose -p smartgym-integrated --env-file .env -f infra/compose.yaml -f infra/compose.integrated.yaml logs --tail 60 rag
```

RAG nhập bản Cypher cùng version vào Neo4j trước khi mở API: **468 nút,567 cạnh**. Bản xuất dùng MERGE, không xóa các namespace khác. Đường dẫn file xuất: `services/kb_rag/data/export/smartgym_six_kb.cypher`. Snapshot/vector R3 nằm trong `services/kb_rag/data/releases/six_exercises_20261118_r3/`. Có thể hỏi chatbot kiến thức khi chưa có dịch vụ model tư thế.

Database tài khoản, nhật ký, video và object storage của máy cũ không nằm trong Git. Đăng ký tài khoản mới, mở Mailpit để xác minh. Bộ dữ liệu Catalog phát triển có trong code; nếu thư viện trên máy mới rỗng, có thể nhập mẫu phát triển sau khi stack chạy:

```powershell
docker compose -p smartgym-integrated --env-file .env -f infra/compose.yaml -f infra/compose.integrated.yaml exec -e ALLOW_DEVELOPMENT_CONTENT=true catalog node dist/import.js data/smartgym-m2.json
```

Nội dung mẫu không thay dữ liệu/media CMS mà thành viên đã bổ sung trên máy riêng. Các chức năng quản lý vẫn có thể được phát triển qua code và CMS.

## 4. Nối dịch vụ model riêng khi cần video

Bản mặc định tắt upload/live inference và worker video; không trả kết quả giả khi chưa có provider. Để dùng video:

1. Thành viên phụ trách model chuẩn bị và chạy provider riêng, tương thích các API studio `/api/health`, `/api/exercises`, `/api/analyze-video`, `/ws/live` và raw contract mà Pose/BFF đang kiểm tra. Không lấy contract của bộ model khác rồi chỉ đổi hash.
2. Cấu hình mTLS: provider dùng `server.key/server.crt/ca.crt` của `.local/compose/pose-engine`; Pose và Web đã có client certificate tương ứng. Chuyển các khóa cần thiết qua kênh riêng nếu provider ở máy khác.
3. Thêm `SMARTGYM_POSE_ENGINE_ORIGIN=https://host.docker.internal:8017` vào `.env`, thay địa chỉ/port nếu khác.
4. Chạy:

```powershell
node scripts/start-integrated.mjs --external-pose --build
```

Khi quản lý stack đã bật external-pose, các lệnh `ps/logs/down` cũng thêm `-f infra/compose.external-pose.yaml`. Mặc định FE/BFF đang ghim contract của bốn model V4 đã tích hợp; KB có tri thức sáu bài. Việc nâng provider lên bộ sáu model mới phải đồng bộ manifest backend/BFF, schema, nhãn, ngưỡng, adapter RAG, KB version và kiểm thử quan sát thật. Bản push này không tự thực hiện nâng cấp đó.

## 5. Dừng, dữ liệu và cập nhật

```powershell
docker compose -p smartgym-integrated --env-file .env -f infra/compose.yaml -f infra/compose.integrated.yaml down
```

Lệnh trên giữ volume dữ liệu. Khi cập nhật code, `git pull` rồi chạy lại `node scripts/start-integrated.mjs --build`. Không dùng `down -v` nếu muốn giữ tài khoản, nhật ký và Neo4j. Việc thay KB cần tạo release/vector/graph đồng nhất, kiểm tra rồi cập nhật script/config; không sửa tay số version trong snapshot.

## 6. Phạm vi kiểm chứng và việc còn mở

Đợt đóng gói đã chạy đạt132 unit test RAG,17 test BFF bằng fixture mTLS, build image RAG và web, thiết lập từ bản Git sạch ở đường dẫn mới, khôi phục Neo4j hai lần và đối chiếu đầy đủ thuộc tính/cạnh. API RAG trong Docker đã trả health đúng version, danh mục12 nguồn và phản hồi cảm ơn không gọi sinh LLM. Xem `docs/handoff-verification.json`. Chưa chạy mới toàn bộ FE/BE trên máy vật lý khác; thành viên nhận vẫn cần kiểm tra đăng ký/đăng nhập và một câu chat có nguồn sau khi dựng stack.

Hồ sơ trước bàn giao ngày18/11/2026 ghi119 request HTTP thật,83 đạt/10 giới hạn hợp lệ/26 cần sửa theo rà phát triển. Đây không phải119 câu đã đạt chất lượng, đánh giá chuyên gia hoặc test mới trên máy người nhận. Hai vấn đề knowledge/practice trên một video squat được ghi riêng. Chưa hoàn thiện consumer CMS→KB, ngưỡng kỹ thuật cá nhân hay nghiệm thu sáu model trong web. Xem `docs/KNOWN_LIMITATIONS.md`.

Các nguồn PDF/HTML gốc được định vị bằng URL/hash trong `services/kb_rag/data/source_manifest.json`. Không cần tải lại để chạy snapshot hiện tại. Khi muốn xây lại KB, tải nguồn hợp lệ vào `services/kb_rag/data/raw/`, kiểm phạm vi/quyền rồi chạy pipeline; không đưa bộ test vào corpus. Các sách lớn, dataset và trọng số Ollama không được nhúng trong Git.
