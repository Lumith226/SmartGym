# Kết nối Pose và RAG với SmartGym Web

## 1. Checkout ba nhánh

Chạy từ thư mục cha trên máy Windows. Mỗi nhánh nằm trong một thư mục riêng.

```powershell
$repo = 'https://github.com/Lumith226/SmartGym.git'
git clone --single-branch --branch SmartGym_Web $repo SmartGym_Web
git clone --single-branch --branch 'Tùng' $repo SmartGym_Pose
git clone --single-branch --branch 'handoff/web-kb-rag-20261107' $repo SmartGym_RAG
Set-Location SmartGym_Web
$env:SMARTGYM_POSE_SOURCE = (Resolve-Path '../SmartGym_Pose').Path
$env:SMARTGYM_RAG_SOURCE = (Resolve-Path '../SmartGym_RAG/smart-gym-ai/services/kb_rag').Path
```

| Thành phần | Đường dẫn hoặc hợp đồng Web cần |
|---|---|
| Pose | `SMARTGYM_POSE_SOURCE` trỏ tới thư mục có `smart_gym_web_v4/server/` và `smart_gym_test_rtmpose_v4/weights/`. Launcher chọn CUDA trong Docker, DirectML trên Windows hoặc CPU. Web lấy danh sách động tác qua `/api/pose-studio/exercises` sau đăng nhập. |
| RAG | `SMARTGYM_RAG_SOURCE` trỏ tới thư mục dịch vụ chứa `kb_service/`, `requirements.lock.txt` và `capabilities.json`. Web gọi `/v1/chatbot` qua BFF, với mTLS và token nội bộ do script chuẩn bị cấu hình. |

## 2. Chuẩn bị dữ liệu và chạy

1. Đội RAG bàn giao `data/index/snapshot.json`, `data/index/embeddings.json` có cùng phiên bản chỉ mục, tên model chat và model embedding tương ứng, cùng thông tin nguồn đã duyệt. Đặt hai file vào `data/index/` dưới `SMARTGYM_RAG_SOURCE`. Kiểm tra với [danh sách nguồn được duyệt](../../infra/config/rag-sources.json). Nhánh RAG đã kiểm tra chỉ có `.gitkeep` trong thư mục chỉ mục.
2. Chuẩn bị thư mục model Ollama nếu khác mặc định và đặt các biến phù hợp với bộ bàn giao.

```powershell
# Ví dụ nếu model được lưu ngoài thư mục mặc định của Ollama
$env:SMARTGYM_OLLAMA_MODELS = 'D:/du-lieu/ollama/models'
# Nếu khác mặc định, đặt SMARTGYM_CHAT_MODEL và SMARTGYM_EMBED_MODEL.

node scripts/check-ai-handoff.mjs --pose-root "$env:SMARTGYM_POSE_SOURCE" --rag-root "$env:SMARTGYM_RAG_SOURCE"
node scripts/prepare-compose-local.mjs
pnpm start:local --build
docker compose --env-file .env -f infra/compose.yaml ps -a
```

Lệnh kiểm bàn giao so khớp hash model và hợp đồng bốn động tác. Để cấu hình OpenSSL, lưu đường dẫn khi mở terminal mới và tạo tài khoản local, xem [hướng dẫn Docker](GETTING_STARTED.md). Compose đầy đủ cần nguồn và chỉ mục RAG ngay cả khi tắt chatbot bằng `SMARTGYM_WEB_RAG_ENABLED=false`. Nếu chưa nhận chỉ mục, có thể kiểm mã và hợp đồng bằng lệnh `check-ai-handoff.mjs` ở trên.

## 3. Kiểm tra từ Web

| Phần | Cách xác nhận |
|---|---|
| Pose | Đăng nhập vào [Phòng tập](https://127.0.0.1:3100/). Chờ trạng thái **Server AI đã sẵn sàng**. Trong tab Network của trình duyệt, `GET /api/pose-studio/exercises` phải trả danh sách có `squat`, `push_up`, `jump_jack`, `situp`. Chọn đúng động tác và chạy camera hoặc tải clip phù hợp để xác nhận kết quả phân tích. |
| RAG | Mở [Hỏi đáp](https://127.0.0.1:3100/hoi-dap), hỏi nội dung có trong chỉ mục và kiểm tra câu trả lời cùng nguồn mở được. Nếu RAG báo chưa sẵn sàng, xem log bằng lệnh bên dưới, kiểm tra phiên bản chỉ mục, model Ollama và trạng thái `kb_ready` theo runbook. |

```powershell
docker compose --env-file .env -f infra/compose.yaml logs --tail=100 web pose-engine rag ollama
```

Xem [ánh xạ và thiết kế AI](../design/AI_INTEGRATION.md) và [runbook RAG](OPERATIONS.md#chatbot-web-t27) để chẩn đoán kết nối. Việc RAG đọc bài tập công bố từ Catalog có [hợp đồng bàn giao riêng](../api/catalog-rag-handoff.yaml) và cần consumer phía RAG.
