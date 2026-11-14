# Chạy SmartGym bằng Docker

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
docker compose --env-file .env -f infra/compose.yaml up -d --build
docker compose --env-file .env -f infra/compose.yaml ps -a
```

Compose dùng Dockerfile trong `infra/docker/`, cấu hình RabbitMQ và danh sách nguồn RAG trong `infra/config/`, cùng script khởi tạo bucket trong `infra/bootstrap/`. Các file khóa runtime AI nằm ở `infra/ai/`.

Script tạo cấu hình, mật khẩu cục bộ và chứng chỉ. Dùng [.env.example](../../.env.example) để tra biến tùy chỉnh. Các mật khẩu và khóa tạo ra nằm trong `.env` và `.local/compose/`. Hai container khởi tạo bucket có thể hiện `Exited (0)` sau khi hoàn thành.

Nếu đã chọn đường dẫn AI khác mặc định, lưu các biến đường dẫn vào `.env` để Compose dùng lại khi bạn mở terminal mới.

## Mở Web và chuẩn bị dữ liệu

1. Mở [https://127.0.0.1:3100](https://127.0.0.1:3100). Đây là địa chỉ loopback. Chứng chỉ được ký bởi CA của bản cài cục bộ.
2. Đăng ký tài khoản của bản cài. Compose dùng Mailpit nội bộ cho email xác minh. Để cấp quyền quản trị, làm theo [runbook Identity](OPERATIONS.md#identity-t08). Đăng nhập lại sau khi đổi vai trò.
3. Dùng [CMS](https://127.0.0.1:3100/admin) để thêm và công bố nội dung, hoặc [nhập gói nội dung được duyệt](OPERATIONS.md#importexport-t34). Migration tạo schema. Tài khoản, các bài RepDB đã nhập ở một máy và media trong object storage cần được chuẩn bị hoặc chuyển riêng khi bàn giao.
4. Google OAuth dùng client riêng và callback đúng Web origin. Xem [cấu hình đăng nhập](OPERATIONS.md#web-auth-t10).
5. Trên Windows, cấu hình DirectML tùy chọn dùng engine mTLS chạy trên máy host. Làm theo [runbook DirectML](OPERATIONS.md#directml-trên-windows) nếu cần GPU. Compose mặc định gọi Pose Engine nội bộ.

## Chuyển dữ liệu từ bản cài cũ

Ưu tiên tạo tài khoản demo và nhập nội dung được phép chia sẻ. Khi chuyển một bản cài cục bộ có sẵn, hai script [Identity](../../scripts/import-compose-identity.mjs) và [Catalog](../../scripts/import-compose-catalog.mjs) đọc từ `SMARTGYM_LEGACY_DATABASE_URL`. Chạy riêng từng lần với URL nguồn tương ứng, trên database đích đã áp dụng migration và còn trống. Dùng `pg_dump` trên PATH hoặc đặt `SMARTGYM_PG_DUMP`. Các script này chuyển dữ liệu PostgreSQL. Tệp media trong object storage cần chuyển riêng cùng các phiên bản được tham chiếu.

## Theo dõi và dừng

```powershell
docker compose --env-file .env -f infra/compose.yaml logs --tail=100 web catalog identity
docker compose --env-file .env -f infra/compose.yaml stop
```

`stop` giữ dữ liệu trong volumes. Đọc [runbook vận hành](OPERATIONS.md) trước khi sao lưu, chuyển dữ liệu hoặc triển khai cho người dùng truy cập qua mạng.
