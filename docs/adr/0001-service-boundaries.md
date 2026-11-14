# ADR 0001 — Ranh giới và triển khai SmartGym Web

**Status ACCEPTED cho phạm vi sản phẩm, bảy ranh giới và CMS thuộc Catalog theo yêu cầu người dùng.** Các runtime/giao thức trong baseline là PROPOSED cho tới mốc triển khai tương ứng. [ADR 0002](0002-m1-toolchain-and-verification.md) ghi các lựa chọn đã chấp nhận trong phạm vi kỹ thuật M1. Quyết định hosting và nội bộ Pose/RAG thuộc chủ thể và mốc tương ứng.

## Bối cảnh

SmartGym có thư viện công khai, lịch tập và nhật ký cần tính nhất quán giao dịch, bên cạnh hai pipeline AI Python hiện có. Catalog phải truy cập được khi AI, email hoặc Identity gặp lỗi. Hệ thống phải triển khai các backend service thuộc phạm vi độc lập, với hợp đồng phiên bản hóa và dữ liệu có chủ sở hữu. Các tính năng tài khoản, lịch tập, tiến độ, nhắc lịch và Admin Dashboard đều nằm trong phạm vi thiết kế đầy đủ.

## Phương án cân nhắc

| Phương án | Đánh giá |
|---|---|
| Gộp Catalog, Identity, Workout, Progress và Notification thành một core có module | Giảm số unit triển khai nhưng gộp vòng đời dữ liệu và phát hành của các miền. Việc phân lập sự cố email hoặc tài khoản ở runtime kém hơn. |
| Bảy service theo bounded context, cùng monorepo | Tách quyền sở hữu dữ liệu, mô hình tải và quy trình triển khai. Chi phí là hợp đồng, migration, tracing và quản lý tương thích giữa các bản phát hành. |
| Tách thêm service media, search, live gateway và admin | Cho phép mở rộng độc lập khi đủ tải. Giai đoạn này các năng lực đó có owner rõ trong Catalog, Pose và Web. Tách thêm làm tăng hợp đồng và công sức vận hành trước khi có chỉ số chứng minh nhu cầu. |

## Quyết định

Chọn **Identity, Catalog, Workout, Progress, Pose Analysis, RAG, Notification**. Web dùng Next.js BFF cùng origin, Admin Dashboard là vùng route có phân quyền trên Web. Backend domain vẫn thực thi quyền. Identity/Catalog/Workout/Progress/Notification dùng NestJS TypeScript theo baseline để thống nhất validation và test tooling. Pose và RAG dùng FastAPI Python để tận dụng module hiện có qua adapter. Workout giữ luật lịch và không chồng lịch. Progress sở hữu nhật ký hoàn thành và số liệu, độc lập với lịch dự kiến.

Chọn PostgreSQL riêng theo quyền sở hữu, object storage phân prefix, SQLite read-only theo revision cho chỉ mục RAG. RAG có control metadata riêng để điều phối revision và replay. Catalog phục vụ tìm kiếm trên dữ liệu của mình trước khi cân nhắc search engine riêng. Giao tiếp truy vấn bằng HTTP và thay đổi cần giao bất đồng bộ bằng RabbitMQ, outbox/inbox và event revision. Pose job worker lấy việc từ hàng đợi bền trong DB Pose để tránh thêm giao dịch hai nơi cho lifecycle. Web/BFF xử lý upgrade WSS cùng origin rồi xác thực upstream Pose. [Kiến trúc](../design/ARCHITECTURE.md) · [Mô hình dữ liệu](../design/DATABASE.md)

## Hệ quả và điều kiện xem xét lại

Theo yêu cầu người dùng về tổ chức thư mục, dùng `frontend/` và `backend/services/<service>/` trong cùng monorepo. Đây là quyết định đã xác nhận về bố cục mã. Package identity, service ownership, API và cách triển khai độc lập giữ theo quyết định kiến trúc hiện có. Cây dự kiến ở [Architecture](../design/ARCHITECTURE.md) và cây thực tế ở [README](../../README.md).

- Dùng ID và revision thay cho cross-service FK, truy vấn DB và chia sẻ domain. Tiến trình đọc phải xử lý dữ liệu chậm cập nhật, API nội bộ lỗi hoặc tài liệu đã gỡ.
- Event at-least-once cần dedup, xử lý sai thứ tự, DLQ và replay theo runbook. Khi thêm broker/event mới, ADR phải giải thích lợi ích giao dịch hoặc vận hành.
- Service mới cần version artifact, pipeline build/test riêng, readiness, tài khoản DB và threat review. Compose cục bộ hỗ trợ lặp lại, còn rollout và rollback độc lập được chứng minh ở mốc tích hợp.
- Xem lại search riêng khi p95 hoặc yêu cầu relevance vượt baseline Catalog. Xem lại GPU/stream transport khi phép đo trên thiết bị đích không đạt. Xem lại quyền sở hữu hoặc tách deployment khi một miền có tải, yêu cầu bảo mật hay vòng đời phát hành thực sự khác.

Mọi thay đổi ADR cần cập nhật [ranh giới service](../design/SERVICE_BOUNDARIES.md), [hợp đồng API](../api/openapi.yaml), migration, kế hoạch và test tương ứng.

## Bổ sung đã xác nhận — Custom Headless CMS

Nguồn AI và nội bộ lưu trữ RAG đã được cập nhật bởi [ADR 0008](0008-ai-provider-handoff.md). Bảy ranh giới nghiệp vụ giữ nguyên. Các mô tả SQLite/PostgreSQL RAG phía trên là baseline lịch sử được thay bằng pipeline JSON/Neo4j của provider bàn giao.

Catalog sở hữu CMS, chỉ có Exercise, MuscleGroup, Equipment, ExerciseVariant và Media. Các bảng revision, audit, import và xuất snapshot là cấu trúc kỹ thuật. Admin Web dùng API Catalog, còn quản lý người dùng dùng Identity nếu tích hợp. Giữ bảy service. Pose/RAG thuộc đội khác, các đề xuất runtime/storage AI ở ADR này là bối cảnh baseline, phạm vi SmartGym Web là tích hợp qua hợp đồng đã xác nhận với đội sở hữu.

Publish chỉ tiến hành sau kiểm dữ liệu, quyền và optimistic lock. Revision public bất biến, support refs được pin, archive giữ ID và lịch sử. Restore thành nháp. Không thêm CMS engine tổng quát. Catalogue events dùng outbox, thêm updated khi thay revision đang public và dùng unpublish reason ARCHIVED cho gỡ công bố. Đây là cụ thể hóa ranh giới đã chọn, không thay đổi topology. [Thiết kế dữ liệu](../design/DATABASE.md) · [Hợp đồng](../api/API_CONTRACTS.md)
