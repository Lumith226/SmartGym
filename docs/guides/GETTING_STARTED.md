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

### Khởi động hằng ngày

Trên Windows, mở Docker Desktop rồi nhấp đúp [Chay-SmartGym.cmd](../../Chay-SmartGym.cmd). Launcher chọn GPU, đợi Compose sẵn sàng và mở Web. Có thể dùng `pnpm start:local` trên các máy đã cài Node.js và Docker.

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
