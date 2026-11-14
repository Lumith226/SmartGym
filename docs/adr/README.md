# Quyết định kiến trúc SmartGym

ADR ghi lại quyết định, lý do và hệ quả. Tra cách chạy ở [Operations](../guides/OPERATIONS.md), cấu hình và phiên bản ở [Technology Versions](../guides/TECHNOLOGY_VERSIONS.md), mức nghiệm thu ở [Tasks](../planning/TASKS.md) và [Test Plan](../planning/TEST_PLAN.md).

## Nền tảng, xác thực và Web

| ADR | Quyết định đang áp dụng | Phạm vi |
|---|---|---|
| [0001](0001-service-boundaries.md) | Bảy ranh giới nghiệp vụ, monorepo và CMS thuộc Catalog | Hệ thống |
| [0002](0002-m1-toolchain-and-verification.md) | Toolchain và cách xác minh baseline | M1 cục bộ |
| [0003](0003-identity-implementation.md) | Identity sở hữu tài khoản, vai trò, phiên và khóa ký | Identity |
| [0004](0004-transactional-email.md) | Outbox Identity, relay RabbitMQ và gửi email qua Notification | Email giao dịch |
| [0005](0005-web-auth-bff.md) | Node HTTPS BFF, IP từ socket và mTLS đến Identity | Web |
| [0024](0024-frontend-ui-stack.md) | Tailwind, component nội bộ trên Radix và state nhẹ | Giao diện Web |
| [0025](0025-authjs-google-account-linking.md) | Auth.js cho đăng nhập và liên kết Google với tài khoản đã xác minh | Web và Identity |
| [0026](0026-compose-observability-and-redis.md) | Probe, giới hạn, telemetry, circuit breaker và Redis | Docker Compose cục bộ |

## Catalog và CMS

| ADR | Quyết định đang áp dụng |
|---|---|
| [0006](0006-catalog-exercise-publication.md) | Revision bất biến, tách bản nháp và công bố |
| [0007](0007-catalog-media-storage.md) | Media riêng của Catalog, upload có giới hạn và kiểm tra trước khi dùng |
| [0009](0009-cms-import-export.md) | Import vào bản nháp theo manifest và export có nguồn gốc |

## Workout, Progress và Notification

| ADR | Quyết định đang áp dụng |
|---|---|
| [0013](0013-workout-plan-implementation.md) | Workout sở hữu chương trình, đối chiếu bài tập qua Catalog |
| [0014](0014-workout-schedule-time.md) | Múi giờ, DST, giao dịch lịch và chống chồng lịch |
| [0015](0015-workout-schedule-reconciliation.md) | Sửa lịch có version, giữ override và khôi phục lịch tương lai |
| [0016](0016-workout-planner-bff.md) | Planner qua BFF, mutation dùng idempotency key và ETag theo hợp đồng |
| [0017](0017-progress-log-ownership.md) | Progress sở hữu nhật ký và snapshot nguồn |
| [0018](0018-progress-summary-ui.md) | Tổng hợp tiến độ theo ngày và hiển thị trên Web |
| [0019](0019-notification-reminders.md) | Nhắc lịch theo phiên bản occurrence và tùy chọn người dùng |
| [0020](0020-notification-inbox-web.md) | API owner cho inbox và tùy chọn nhắc lịch |

## Pose và RAG

| ADR | Quyết định đang áp dụng | Phạm vi đã chốt |
|---|---|---|
| [0008](0008-ai-provider-handoff.md) | Tích hợp Pose V4 và KB/RAG bàn giao qua hợp đồng | Nguồn và ranh giới |
| [0010](0010-local-ai-cpu-runtime.md) | Profile CPU và kiểm chứng engine bàn giao | Smoke test T21 |
| [0011](0011-pose-coordination.md) | Điều phối Pose trong NestJS, inference trong FastAPI | Pose API, worker và engine |
| [0012](0012-pose-live-session.md) | WSS cùng origin và vòng đời live session | Web, Pose và engine |
| [0021](0021-pose-progress-import.md) | Nhập summary đã xác minh vào Progress | Pose và Progress |
| [0022](0022-catalog-rag-producer.md) | Catalog phát snapshot/event để RAG có thể đồng bộ | Producer Catalog. Consumer và staging là cổng nghiệm thu riêng. |
| [0023](0023-rag-web-adapter.md) | Web chuyển câu hỏi và kết quả Pose theo owner sang RAG | Adapter Web. Chất lượng corpus và generation là cổng nghiệm thu riêng. |

## Cập nhật ADR

- Giữ mã và đường dẫn của ADR đã được tham chiếu. Làm rõ phạm vi hoặc bằng chứng ngay trong ADR hiện có. Khi thay quyết định, tạo ADR mới và liên kết hai chiều. Chỉ đánh dấu `SUPERSEDED` khi toàn bộ quyết định đã được thay thế.
- ADR mới ghi trạng thái `PROPOSED`, `ACCEPTED` hoặc `SUPERSEDED`, phạm vi, căn cứ chấp thuận, phương án, hệ quả và thời điểm xem xét lại.
- `ACCEPTED` xác nhận lựa chọn thiết kế trong phạm vi ghi trên ADR. Đọc [Test Plan](../planning/TEST_PLAN.md) để biết môi trường và mức độ kiểm chứng.
