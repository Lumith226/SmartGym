# Kiểm kê repository và phương án tái sử dụng

Ngày 2026-11-08, snapshot `kb-m2-9644078731a2135dafa0` trong Web vẫn chứa 35 bài với cờ `development-only`. Đường dẫn `knowledge_base` của nguồn SmartGym dùng trong audit M0 hiện thiếu trên máy. Phép thử local tiếp tục dùng snapshot đã lưu. Cổng phát hành cần đối chiếu lại với nguồn và quyền được bàn giao. Thư mục `data` trong `kb_rag` hiện chỉ có `.gitkeep`.

## Runtime T21 hiện hành — 2026-11-07

Đã tạo uv/Python và venv Pose/RAG riêng dưới WRITE_ROOT theo ADR 0010. Bốn bài có inference CPU thật đủ scope video/window/rep, RAG nhận 14 raw fixtures; 16 provider regression tests đạt với fixture tổng hợp. Thiếu corpus/index được kiểm lại trong cả services.rar. Nguồn provider chỉ được đọc/import với bytecode/cache/temp kiểm soát, không sửa pipeline/model/requirements. [Runtime evidence](../api/ai-runtime-verification.yaml). Cổng Web/auth/jobs, corpus generation và production vẫn còn ở các task sau.

## Đối chiếu nguồn trước runtime T21 — 2026-11-07

Người dùng xác nhận RAG từ `E:\do an\smart-gym-ai\services\kb_rag`, Pose từ `E:\do an\SmartGym`. Đã đọc bản bàn giao, app/model/schema và hash bốn ONNX. Pose hiện hành có API FastAPI trong `smart_gym_web_v4/server`, analyzer/model trong `smart_gym_test_rtmpose_v4`. RAG `/v1/chatbot` dùng JSON snapshot/vector, Neo4j và Ollama. Cả bốn contract V4 giống từng byte giữa hai nguồn, model digest khớp label catalog RAG. [AI integration](../design/AI_INTEGRATION.md) · [Manifest đối chiếu](../api/ai-provider-compatibility.yaml)

Các thư mục raw/index của RAG hiện chỉ có .gitkeep, curated chưa có file. Không chạy ingest/model/test provider trong lượt này. Quy tắc Chapter 4 được AGENTS provider trỏ tới ở thư mục cha đang thiếu. Đây là SOURCE_VERIFIED, chưa phải RUNTIME_VERIFIED. Nguồn RAG cũ và camera V2 trong bảng tiếp theo chỉ mô tả audit lịch sử M0.

## Phạm vi kiểm tra lịch sử M0

- Đích `E:\do an\SmartGym_Web` tại đầu lượt có `MASTER_PROMPT_SMARTGYM.md` và chưa có Git root hoặc mã ứng dụng. Audit dùng danh sách file trước/sau.
- Nguồn `E:\do an\SmartGym` ở nhánh `backend`, HEAD `813ecb2`. Worktree có sửa đổi ở RAG và Knowledge Base cùng các thư mục runtime/output/tmp ngoài theo dõi. Các quan sát bên dưới dựa trên worktree, không mặc định đồng nhất với commit. Git status được đọc với optional locks tắt.
- `SOURCE_VERIFIED` dùng cho mã, cấu hình hoặc dữ liệu đọc được. `RUNTIME_VERIFIED` chỉ dùng sau phép thử thực thi. Trong lượt này, kiểm kê tĩnh bằng đọc file, danh sách và hash. Inference, LLM, script và tests legacy để `NOT RUN`.

| Tài sản | Bằng chứng và giới hạn | Quyết định dùng lại |
|---|---|---|
| Catalog và wiki | `knowledge_base/exercise_catalog.json` đọc thành công. Có 33 bài chính và 2 bổ sung camera là `pull_up`, `barbell_bench_press`. Bản ghi mẫu `bodyweight_squat` chứa ID, tên và wiki path. Nhóm cơ, dụng cụ, chỉ dẫn và nguồn phải được chuẩn hóa từ các trang. Wiki ghi 7 bài kiến thức chung. | Giữ ID ASCII. Nhập snapshot vào Catalog qua staging, đối chiếu nội dung và taxonomy trước publish. RAG dùng snapshot đã publish và bài kiến thức đã duyệt. |
| Biến thể cần đối chiếu | `knowledge_base/README.md` và index ghi Side Plank, Yoga Push-up, Squat Kick, Inchworm cần đối chiếu clip. | Hiển thị mô tả đã duyệt, dùng fallback khi thiếu tài sản hợp lệ. Không gắn capability Pose từ việc trùng tên bài. |
| Pose desktop | `smart_gym_camera_app/app.py` mở webcam/video cục bộ, có 7 cấu hình chọn tay, trong đó hai biến thể model squat. `onnx_gym_analyzer.py`, `rep_tracker.py` và `coach_mappings/` là điểm tái sử dụng. Tệp `best_stgcnpp_squat_v2.onnx` dài 4.567.775 byte. Các tên `best_stgcnpp_situp_v2.onnx` và `best_stgcnpp_crunch_v2.onnx` trỏ cùng Git blob tại index. | Dùng adapter nhận frame từ upload hoặc WebSocket, giữ logic pose/rep/form đã kiểm tra. Xác minh model nạp thực tế, biến thể và nhãn trước khi bật. GUI desktop và mở camera trực tiếp được thay bằng trình duyệt và luồng server. |
| RAG | `backend/rag/api.py` định nghĩa `POST /api/chat`, câu hỏi trim 1–1.000 ký tự và `include_evidence=false`. `GET /api/sources/{document_id}` trả text hoặc 404. Lỗi generation trả 503. Có retrieval, index, cấu hình model và ca đánh giá trong KB. | Giữ pipeline qua adapter revisioned snapshot. Thay nguồn file cục bộ bằng gói nội dung được phép. Hợp đồng web v1 và hợp đồng cũ được đối chiếu trong [API contracts](../api/API_CONTRACTS.md). |
| Identity, Workout, Progress, Notification, Admin web | Audit phát hiện ứng dụng camera và backend RAG trong các điểm vào đã xem. Nhật ký desktop không xác lập một API nhật ký người dùng cho Web. | Xây theo hợp đồng mới. Có thể dùng dữ liệu desktop làm fixture đã duyệt, với ID thử nghiệm riêng và dữ liệu đã loại nhận dạng. |

## Mốc provenance và cổng nhập

| File đã đọc | SHA-256 của worktree |
|---|---|
| `knowledge_base/exercise_catalog.json` | `930790740F1E2DC3428050A72A38DA9B36226E94610E34423B44462DF1374CD4` |
| `backend/rag/api.py` | `3FAC2993ABB6909C1CCB836011B9B18A9A9CBF02BC6BA152F1EE719EB67CC7C4` |
| `smart_gym_camera_app/onnx_gym_analyzer.py` | `4D9E987FD2B1CF16D567F358DCDDBF147C05AAB024672AD1483B95F33CB5E5D5` |

- Lập manifest lúc nhập gồm path tương đối, commit/snapshot, SHA-256, phiên bản dependency, mục đích, quyền sử dụng và phân phối, thay đổi adapter, bộ test và người duyệt. Xác minh riêng nội dung, SVG/media, model weights và thư viện. Dòng ghi nguồn trong wiki hoặc việc có tệp trong repo chỉ hỗ trợ kiểm kê.
- Chỉ mang tài sản vào đích ở task Development được giao. Loại secrets, đường dẫn máy cá nhân, dữ liệu nhạy cảm, cache và log khỏi manifest phân phối. Nếu thiếu quyền, khóa phát hành tài sản cụ thể, giữ giao diện fallback và tiếp tục phần độc lập.
- Duyệt adapter, fixture, giấy phép và hợp đồng trước khi sao chép. Dùng phiên bản đã đóng gói trong local/staging/production. Script legacy chỉ có thể chạy ngoài Planning khi đã đọc và xác minh tác dụng phụ, phạm vi quyền và điểm ghi.

Xem [AI integration](../design/AI_INTEGRATION.md), [bảo mật](../design/SECURITY.md) và [tasks](../planning/TASKS.md).

CMS import dùng catalog JSON và wiki snapshot đã duyệt. Bốn biến thể cần đối chiếu giữ cờ trong báo cáo. Chỉ map vào năm content type và phụ lục nguồn kỹ thuật dùng cho xuất RAG. Snapshot phải có danh sách file và hash, trường được chuẩn hóa, ID/biến thể, media provenance/rights và người duyệt. File ngoài manifest, secret hoặc URL tùy ý bị loại. Xem [giao dịch CMS](../design/DATABASE.md) và [hợp đồng import](../api/API_CONTRACTS.md).
