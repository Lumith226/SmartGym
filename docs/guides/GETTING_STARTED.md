# Chạy SmartGym bằng Docker

Nếu lấy mã AI từ GitHub, xem [hướng dẫn checkout và kết nối ba nhánh](AI_HANDOFF.md).

## Chuẩn bị

- Docker có Docker Compose, Node.js 24 và OpenSSL. Chạy lệnh từ thư mục gốc repository.
- Mã nguồn và weights Pose theo [tài liệu tích hợp AI](../design/AI_INTEGRATION.md).
- Nguồn RAG bàn giao gồm mã provider và chỉ mục có `data/index/snapshot.json` và `embeddings.json`. Script chuẩn bị đối chiếu nguồn được duyệt với [registry](../../infra/config/rag-sources.json). Ollama cần có model chat và embedding tương ứng với cấu hình.

Stack đầy đủ hiện yêu cầu các tài sản AI bên ngoài repository. Đặt `SMARTGYM_WEB_RAG_ENABLED=false` sẽ tắt chatbot trên Web. Bootstrap và Compose đầy đủ vẫn cần nguồn RAG. Khi chỉ cần phát triển thư viện hoặc kiểm thử giao diện, xem [chế độ kiểm thử cục bộ](DEVELOPMENT.md).

## Khởi tạo cấu hình

Nếu hai repo AI nằm cạnh repo Web dưới tên `SmartGym` và `smart-gym-ai`, script dùng đường dẫn mặc định. Nếu lưu khác chỗ, đặt biến tương ứng trước khi chuẩn bị.

```powershell
$env:SMARTGYM_POSE_SOURCE = 'D:/du-an/SmartGym'
$env:SMARTGYM_RAG_SOURCE = 'D:/du-an/smart-gym-ai/services/kb_rag'
$env:SMARTGYM_OLLAMA_MODELS = 'D:/du-lieu/ollama/models'
```

Trên Windows, nếu OpenSSL chưa có trên PATH, có thể dùng bản đi kèm Git for Windows.

```powershell
$env:OPENSSL_BINARY = 'C:/Program Files/Git/usr/bin/openssl.exe'
$env:OPENSSL_CONF = 'C:/Program Files/Git/usr/ssl/openssl.cnf'
```

```powershell
node scripts/prepare-compose-local.mjs
pnpm start:local --build
docker compose --env-file .env -f infra/compose.yaml ps -a
```

Compose dùng Dockerfile trong `infra/docker/`, cấu hình RabbitMQ và danh sách nguồn RAG trong `infra/config/`, cùng script khởi tạo bucket trong `infra/bootstrap/`. Các file khóa runtime AI nằm ở `infra/ai/`.

Script tạo cấu hình, mật khẩu cục bộ và chứng chỉ. Dùng [.env.example](../../.env.example) để tra biến tùy chỉnh. Các mật khẩu và khóa tạo ra nằm trong `.env` và `.local/compose/`. Hai container khởi tạo bucket có thể hiện `Exited (0)` sau khi hoàn thành.

Nếu đã chọn đường dẫn AI khác mặc định, lưu các biến đường dẫn vào `.env` để Compose dùng lại khi bạn mở terminal mới.

Nếu Ollama trên Windows báo `read error: Cannot allocate memory` khi nạp model từ ổ Windows, có thể sao chép model đã cài vào volume Linux của Docker. Chạy khi container Ollama đang dùng thư mục model gốc tại `/models`.

```powershell
docker run --rm --network none --volumes-from smartgym-ollama-1:ro --mount type=volume,source=smartgym-ollama-models,target=/model-cache --entrypoint sh ollama/ollama:latest -ec 'cp -a /models/. /model-cache/'
```

Đặt `SMARTGYM_OLLAMA_MODELS=smartgym-ollama-models` trong `.env` rồi chạy lại SmartGym. Volume chứa bản sao của các model đã cài và cần đủ dung lượng trống.

### Thử Qwen API trong Hỏi đáp

Tạo khóa của workspace Singapore trong [Alibaba Cloud Model Studio](https://www.alibabacloud.com/help/en/model-studio/get-api-key). Lưu khóa vào tệp văn bản UTF-8 `.local/compose/rag/qwen-api-key` với quyền đọc của container RAG. Nếu dùng `SMARTGYM_CONFIG_DIR`, đặt tệp vào thư mục `rag/` của cấu hình đó. Giữ khóa ngoài Git.

Thêm `SMARTGYM_QWEN_ENABLED=true` vào `.env`. Nếu workspace có endpoint riêng, đặt `SMARTGYM_QWEN_BASE_URL` theo [tài liệu Model Studio](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions). Model mặc định là `qwen3.8-flash`.

```powershell
docker compose --env-file .env -f infra/compose.yaml up -d --build --no-deps rag web
```

Trong **Hỏi đáp**, chọn **Mô hình → Qwen API**. Qwen chỉ xử lý từng câu hỏi kiến thức độc lập. Câu hỏi và các đoạn tài liệu truy xuất được gửi tới Alibaba Cloud. Lịch sử chat và kết quả Pose không đi qua nhánh này. Ollama vẫn tạo embedding cho chỉ mục hiện tại.

### Thử Gemini API trong Hỏi đáp

Tạo API key ở [Google AI Studio](https://aistudio.google.com/apikey). Lưu khóa vào `.local/compose/rag/gemini-api-key` hoặc thư mục `rag/` của `SMARTGYM_CONFIG_DIR`. Đặt `SMARTGYM_GEMINI_ENABLED=true` trong `.env`, rồi tạo lại hai container `rag` và `web` bằng lệnh Compose ở trên. Model mặc định là `gemini-3.5-flash-lite`, có thể cấu hình qua `SMARTGYM_GEMINI_MODEL`.

Chọn **Mô hình → Gemini API** để hỏi từng câu kiến thức. Gemini nhận câu hỏi và đoạn trích được truy xuất. Lịch sử chat, kết quả Pose và bước embedding được giữ cục bộ. Xem [tài liệu Gemini API tương thích OpenAI](https://ai.google.dev/gemini-api/docs/openai) và [điều khoản Gemini API](https://ai.google.dev/gemini-api/terms).

### Khởi động hằng ngày

Trên Windows, mở Docker Desktop rồi nhấp đúp [Chay-SmartGym.cmd](../../Chay-SmartGym.cmd). Launcher chọn GPU, đợi Compose sẵn sàng và mở Web. Có thể dùng `pnpm start:local` trên các máy đã cài Node.js và Docker.

Với **Ollama local**, launcher tự thử CUDA trong Docker trên máy NVIDIA, hoặc Vulkan trên Windows và Linux khi có thiết bị tương thích. Trên Windows AMD cần cài [Ollama cho Windows](https://ollama.com/download/windows) và có sẵn hai model của SmartGym. Launcher tự bật Ollama ngầm khi cần. Sau khi khởi động, RAG nạp thử model và xác nhận GPU. Nếu không xác nhận được, launcher dùng Ollama CPU trong Docker. `SMARTGYM_OLLAMA_ACCELERATION=cpu` bỏ qua bước thử GPU. Xem [hỗ trợ phần cứng Ollama](https://docs.ollama.com/gpu).

Lần đầu trên mỗi máy, dùng launcher để tự dò phần cứng. Nút **Start** trong Docker Desktop dùng lại cấu hình container đã tạo. Trên Windows dùng Ollama native, chạy launcher sau khi khởi động lại máy hoặc đăng ký [tác vụ chạy ngầm](OPERATIONS.md#ollama-gpu-trên-windows).

- NVIDIA x86-64 có GPU truy cập được từ Docker sẽ chạy Pose bằng CUDA trong container. Cần driver NVIDIA phù hợp CUDA 12.8 và Docker Desktop với WSL 2 trên Windows hoặc NVIDIA Container Toolkit trên Linux. Lần đầu Docker tải thư viện CUDA và cuDNN để tạo image Pose. Xem [Docker Desktop GPU](https://docs.docker.com/desktop/features/gpu/) và [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html).
- Windows x64 thử DirectML khi Docker không phát hiện GPU NVIDIA tương thích. Nếu mô hình GPU không thể khởi tạo hoặc Web không kết nối được, launcher chạy Pose CPU trong Docker.
- Sau khi launcher đã tạo container CUDA, có thể bấm **Start** trong Docker Desktop ở các lần sau. Docker giữ cấu hình GPU lúc tạo container. Khi đổi máy, đổi GPU hoặc cần chọn lại thiết bị, chạy launcher.

## Mở Web và chuẩn bị dữ liệu

1. Mở [https://127.0.0.1:3100](https://127.0.0.1:3100). Đây là địa chỉ loopback. Chứng chỉ được ký bởi CA của bản cài cục bộ.
2. Đăng ký tài khoản của bản cài. Compose dùng Mailpit nội bộ cho email xác minh. Để cấp quyền quản trị, làm theo [runbook Identity](OPERATIONS.md#identity-t08). Đăng nhập lại sau khi đổi vai trò.
3. Dùng [CMS](https://127.0.0.1:3100/admin) để thêm và công bố nội dung, hoặc [nhập gói nội dung được duyệt](OPERATIONS.md#importexport-t34). Migration tạo schema. Tài khoản, các bài RepDB đã nhập ở một máy và media trong object storage cần được chuẩn bị hoặc chuyển riêng khi bàn giao.
4. Google OAuth dùng client riêng và callback đúng Web origin. Xem [cấu hình đăng nhập](OPERATIONS.md#web-auth-t10).
5. Trên Windows x64, có thể đăng ký tự khởi động Pose một lần để những lần sau mở SmartGym từ Docker Desktop. Phòng tập tự kết nối và hiển thị thiết bị GPU hoặc CPU. Xem [runbook DirectML](OPERATIONS.md#directml-trên-windows).

## Chuyển dữ liệu từ bản cài cũ

Ưu tiên tạo tài khoản demo và nhập nội dung được phép chia sẻ. Khi chuyển một bản cài cục bộ có sẵn, hai script [Identity](../../scripts/import-compose-identity.mjs) và [Catalog](../../scripts/import-compose-catalog.mjs) đọc từ `SMARTGYM_LEGACY_DATABASE_URL`. Chạy riêng từng lần với URL nguồn tương ứng, trên database đích đã áp dụng migration và còn trống. Dùng `pg_dump` trên PATH hoặc đặt `SMARTGYM_PG_DUMP`. Các script này chuyển dữ liệu PostgreSQL. Tệp media trong object storage cần chuyển riêng cùng các phiên bản được tham chiếu.

## Theo dõi và dừng

```powershell
docker compose --env-file .env -f infra/compose.yaml logs --tail=100 web catalog identity
docker compose --env-file .env -f infra/compose.yaml stop
```

`stop` giữ dữ liệu trong volumes. Đọc [runbook vận hành](OPERATIONS.md) trước khi sao lưu, chuyển dữ liệu hoặc triển khai cho người dùng truy cập qua mạng.
