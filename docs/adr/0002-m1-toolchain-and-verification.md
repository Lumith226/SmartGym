# ADR 0002 — Toolchain M1 và phạm vi kiểm chứng

**Status ACCEPTED cho triển khai M1 cục bộ và kiểm thử.** Căn cứ là người dùng đã giao bắt đầu và tiếp tục thực hiện Development theo thiết kế SmartGym, với quyền quyết định kỹ thuật thông thường. Các ràng buộc sản phẩm và topology ở ADR 0001 giữ nguyên giá trị. Quyết định hosting và công nghệ thay ranh giới service vẫn cần ADR riêng.

## Bối cảnh và phương án

Khi bắt đầu M1, máy có Node.js 24 và chưa có Docker CLI hoặc PostgreSQL server. M1 cần migration thật, import snapshot, public API và Web hoạt động qua hợp đồng. Dùng SQL migration và driver pg đáp ứng các ràng buộc PostgreSQL dự kiến. Next.js và NestJS đã được chọn làm baseline và build/kiểm thử với dependency có lockfile. Cách chạy hệ thống hiện tại nằm trong [hướng dẫn Docker](../guides/GETTING_STARTED.md).

Các phương án kiểm chứng gồm chỉ dùng database nhúng, chờ môi trường Compose, hoặc bổ sung PostgreSQL server portable trong workspace. Chọn test nhanh bằng PGlite cùng test TCP trên server portable Windows x64. Chọn Playwright để thao tác Web thật và Swagger Parser/Ajv để xác minh hợp đồng. Tài sản này thuộc công cụ kiểm thử, không thêm backend service.

## Quyết định và hệ quả

- Catalog dùng NestJS ESM, TypeScript và pg. Web dùng Next.js SSR gọi Catalog qua server-side fetch cùng cấu hình endpoint. Phiên bản được khóa trong manifest/lockfile và ghi tại [bảng phiên bản](../guides/TECHNOLOGY_VERSIONS.md).
- Cụm PostgreSQL kiểm thử có data directory riêng, mật khẩu ngẫu nhiên, chỉ listen 127.0.0.1 và cleanup sau test. Dùng binary optional trên Windows x64 để môi trường Linux build có thể bỏ qua. Không cài Windows service hoặc thay cụm bên ngoài. Chuỗi phiên bản beta thuộc gói phân phối binary, server báo PostgreSQL 18.6. Cổng deployment cần xác minh artifact đã duyệt riêng.
- Script test-postgres dùng cùng driver pg, migration, import và app với production entry point. PGlite chỉ là công cụ dev/test nhanh. Native pg_ctl có thể cần chạy ngoài sandbox để tạo process con trên Windows, quyền này không chuyển thành quyền triển khai production.
- Snapshot M1 chỉ dùng local phát triển, một bài Squat từ nguồn người dùng, có hash và không kèm media. Import chặn ở NODE_ENV=production. CMS admin đầy đủ, import quản trị và phát hành dữ liệu đã duyệt theo các task tương ứng.
- Schema đọc M1 là lát cắt đầu. Các bảng quyền, revision CMS nâng cao, outbox và admin mutations được bổ sung bằng migration trong mốc phù hợp. M2/T38 chuyển search/filter/keyset và LIMIT+1 vào PostgreSQL, giữ giao thức cursor gắn revision. Snapshot 35 bài phục vụ phát triển, chỉ append khi nội dung cũ không đổi. CLI bootstrap giữ độc lập với workflow quản trị CMS M4.
- Compose và Dockerfiles có trong repo để chạy PostgreSQL server khi sẵn Docker. Test portable/browser không thay thế cổng container, deployment, ACL hoặc tải M6.

## Điều kiện xem xét lại

Khi CI chuyển platform, workload tăng hoặc thay engine/runtime, chọn cách cấp PostgreSQL và browser phù hợp rồi chạy contract/integration tests. Nếu thay database semantics, service boundary hoặc công nghệ đã chấp nhận, ghi ADR PROPOSED và chỉ chặn phần phụ thuộc khi chưa có căn cứ chấp thuận. Bằng chứng runtime có môi trường và ca tái lập mới xác lập hành vi thực tế.
