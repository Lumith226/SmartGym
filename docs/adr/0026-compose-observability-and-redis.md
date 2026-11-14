# ADR 0026 — Giám sát và phục hồi trong Docker Compose

**Trạng thái** — `ACCEPTED` cho môi trường Docker Compose cục bộ theo yêu cầu bổ sung đầy đủ cơ chế vận hành.

## Quyết định

- Compose dùng điểm kiểm tra readiness theo khả năng của từng API và hạ tầng. Worker và relay kiểm heartbeat. API mTLS cấp quyền probe qua chứng chỉ của chính container trên loopback. Bootstrap bucket dùng mã thoát. Mỗi container có giới hạn CPU, RAM và PID.
- Runtime Node ghi log JSON và xuất trace/metrics/log bằng OTLP khi bật profile giám sát. Python dùng OpenTelemetry hiện thực tại biên FastAPI. Outbox lưu trace context riêng cùng giao dịch và relay truyền lại qua AMQP header. Payload sự kiện nghiệp vụ giữ hợp đồng hiện tại.
- Profile giám sát cục bộ gom Collector, Loki, Tempo, Prometheus và Grafana trong một container. Prometheus gửi cảnh báo tới Alertmanager riêng. Collector bỏ thuộc tính truy vấn URL, truy vấn SQL, cookie và authorization.
- BFF dùng circuit breaker cục bộ cho readiness và generation của RAG. Chat dùng Redis cho bộ đếm và lease. Catalog cache revision bất biến theo ID và version từ PostgreSQL. Identity dùng Redis làm chỉ mục phiên và vẫn xác minh hiệu lực, quyền, thu hồi qua PostgreSQL.

## Hệ quả

Giới hạn mặc định cần đo lại khi thay tải hoặc model. Redis là phụ thuộc của chat trong Docker. Catalog và Identity có thể quay lại PostgreSQL khi cache gián đoạn. Giữ mTLS và quyền sở hữu dữ liệu của [ADR 0001](0001-service-boundaries.md) và [ADR 0005](0005-web-auth-bff.md).

Xem [Runbook](../guides/OPERATIONS.md#vận-hành-và-giám-sát-cục-bộ) và [cấu hình](../../infra/compose.yaml). Xem lại khi chuyển ra môi trường dùng chung, cần điều khiển breaker qua nhiều replica hoặc cần đích nhận cảnh báo bên ngoài.
