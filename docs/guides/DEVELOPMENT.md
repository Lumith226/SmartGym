# Phát triển và kiểm thử SmartGym

Chạy các lệnh từ thư mục gốc repository. Để chạy đầy đủ bằng Docker, xem [hướng dẫn cài đặt](GETTING_STARTED.md).

## Build và kiểm tra hợp đồng

Yêu cầu Node.js 24 và pnpm 11.25.0. Các phiên bản và phạm vi kiểm chứng ở [Technology Versions](TECHNOLOGY_VERSIONS.md).

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm test
pnpm test:system
pnpm check:contracts
pnpm check:boundaries
```

## Chạy Catalog và Web riêng

Chạy Catalog với PostgreSQL nhúng trong terminal thứ nhất.

```powershell
pnpm --filter @smartgym/catalog dev:embedded
```

Ở terminal thứ hai, chạy Web rồi mở [SmartGym local](http://localhost:3000).

```powershell
pnpm --filter @smartgym/web start
```

Catalog ở port 3001, Web ở port 3000. Cả hai mặc định kết nối qua loopback. Runner nhúng dùng PGlite devDependency và lưu ở backend/services/catalog/.local/catalog. Catalog mới khởi tạo trống. Bộ 35 bài M2 đã ngừng sử dụng trên Web và chỉ còn làm dữ liệu kiểm thử.

Để thử đăng nhập bằng email trên Windows, chạy `pnpm build`, chuẩn bị broker bằng `node scripts/prepare-broker-tools.mjs` nếu chưa có, rồi chạy `node scripts/dev-auth.mjs` từ root. Terminal hiện URL HTTPS và tài khoản demo đã xác minh. Runner dùng PostgreSQL, RabbitMQ và SMTP sandbox trên loopback. Dữ liệu demo được dọn khi dừng bằng Ctrl+C. Trình duyệt cần tin cậy CA thử nghiệm để mở URL HTTPS. [Cấu hình auth](OPERATIONS.md#web-auth-t10)

Fixture M2 ghi 36 file nguồn kèm SHA-256 và bốn biến thể cần đối chiếu clip. Khi có thư mục KB được bàn giao và cần cập nhật fixture, chạy `prepare-catalog` với đường dẫn nguồn thực tế. Công cụ kiểm ID và schema. `taxonomy-mapping.json` lưu quyết định phân nhóm phục vụ kiểm thử.

```powershell
pnpm --filter @smartgym/catalog build
node scripts/prepare-catalog.mjs "D:/du-an/SmartGym/knowledge_base" backend/services/catalog/data/smartgym-m2.json
```

Để kiểm thử PostgreSQL server thật qua TCP trên Windows x64, chạy lệnh sau. Binary portable là optional dependency, cụm tạm chỉ nghe loopback, tạo mật khẩu ngẫu nhiên và được đóng/dọn sau test. Sandbox Windows có thể cần cho phép tạo process PostgreSQL.

```powershell
pnpm test:postgres
```

Cài Chromium vào workspace rồi chạy bộ kiểm thử trình duyệt. Các luồng dùng PostgreSQL TCP và khởi chạy broker, SMTP sandbox hoặc provider fixture theo từng suite. Bật `CMS_TEST_TOOLS=true` khi các công cụ media đã được chuẩn bị để chạy cả ca upload CMS.

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.local/browsers'
pnpm exec playwright install chromium
pnpm test:browser
```

Catalog entrypoint dùng driver pg với DATABASE_URL. Để dùng server sẵn có, đặt biến đó rồi chạy `pnpm --filter @smartgym/catalog run migrate` và `pnpm --filter @smartgym/catalog start`. Chỉ nhập snapshot có nguồn đã duyệt khi cần nạp nội dung mới. CLI bootstrap chỉ thêm nội dung mới hoặc nhập lại nội dung giữ nguyên. Thay đổi nội dung đã có qua workflow revision CMS.

## Chạy Identity riêng

Identity yêu cầu Node.js 24.22.1, PostgreSQL database riêng và cấu hình TLS/secret tại [mẫu cấu hình](../../backend/services/identity/.env.example). Nạp biến bằng shell/secret manager, service không tự đọc .env. [Runbook Identity](OPERATIONS.md#identity-t08) mô tả caller ACL, migration, rotation và quyền cấp ADMIN.

```powershell
pnpm --filter @smartgym/identity build
pnpm --filter @smartgym/identity run migrate
pnpm --filter @smartgym/identity start
```

Test nhanh riêng bằng `pnpm test:identity`; cần OpenSSL để sinh certificate tạm, trên Windows runner dùng OpenSSL có sẵn trong Git hoặc OPENSSL_TEST_BINARY. Không cài certificate vào máy. `pnpm test` chạy Catalog/Identity/Notification bằng PGlite và SMTP sandbox. `pnpm test:postgres` chạy ba backend bằng PostgreSQL TCP với database/role riêng. Không có tài khoản ADMIN mặc định.

## Notification và email sandbox

Notification có [cấu hình riêng](../../backend/services/notification/.env.example), migrations và các lệnh build/migrate/start theo package @smartgym/notification. Identity relay chạy process riêng bằng pnpm --filter @smartgym/identity run relay với IDENTITY_DATABASE_URL và IDENTITY_AMQP_URL. Cấu hình broker topology trước bằng script provisioning có quyền riêng; runtime chỉ có quyền publisher hoặc consumer tương ứng. [Runbook](OPERATIONS.md#notification-email-t09) mô tả thứ tự chạy, TLS, retry, DLQ và UNKNOWN.

Kiểm thử toàn luồng trên Windows x64 bằng runtime portable. Bước chuẩn bị tải khoảng 257 MB ZIP chính thức, kiểm SHA-256 và giải nén vào .local, không chạy installer hoặc tạo Windows service. Công cụ cần quyền mạng/process phù hợp. Không có email nào gửi ra ngoài: SMTP test chỉ nghe loopback và chỉ giữ thư trong bộ nhớ.

```powershell
node scripts/prepare-broker-tools.mjs
pnpm test:notification
pnpm test:email
```

test:email tạo và đóng cụm PostgreSQL, RabbitMQ/EPMD, database/role, certificate và SMTP riêng. Test chạy Identity API, relay và Notification qua hợp đồng, có kiểm process độc lập. Dockerfile.notification là artifact dự kiến. Kiểm container và cấu hình provider/domain email thật thuộc cổng staging.

## Web và xác thực

`pnpm --filter @smartgym/web start` dùng Node server trong package frontend. Chế độ mặc định phục vụ thư viện HTTP local. Để bật tài khoản, cấu hình HTTPS Web và mTLS tới Identity theo mẫu và runbook. Dùng cùng giá trị web origin tại Web, Identity và Notification. [Mẫu cấu hình Web](../../frontend/.env.example) · [Runbook T10](OPERATIONS.md#web-auth-t10)

```powershell
node scripts/prepare-broker-tools.mjs
pnpm test:bff
pnpm test:browser
```

`test:browser` cần Chromium đã cài bằng Playwright và chạy các luồng auth HTTPS, quản trị bài tập và Catalog public trên Windows x64. Luồng tài khoản lấy liên kết xác minh/reset từ SMTP sandbox cục bộ.

## API quản trị Catalog

Catalog dùng migration 003–007 cho revision, công bố, audit, xác minh media và nhập/xuất. Bật listener quản trị riêng bằng biến môi trường Catalog và certificate mTLS. `/admin` có editor cho năm loại, lịch sử, so sánh, khôi phục thành nháp, upload/preview và nhật ký. S3 private và worker ClamAV/FFmpeg phục vụ tệp đã kiểm qua gateway có byte range. Chạy `pnpm test:catalog-admin` để kiểm CMS, `pnpm test:catalog-media` để kiểm media hoặc theo runbook T35 để kiểm giao diện cùng công cụ local. [Mẫu cấu hình Catalog](../../backend/services/catalog/.env.example) · [Runbook CMS](OPERATIONS.md#admin-cms-t35)
