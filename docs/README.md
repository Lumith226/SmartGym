# Tài liệu SmartGym

| Bạn cần | Đọc |
|---|---|
| Cài và chạy trên máy mới | [Docker và chuẩn bị dữ liệu](guides/GETTING_STARTED.md) |
| Build hoặc chạy kiểm thử | [Phát triển và kiểm thử](guides/DEVELOPMENT.md) |
| Hiểu tính năng và thao tác người dùng | [Yêu cầu sản phẩm](design/PRD.md), [luồng nghiệp vụ](design/USER_FLOWS.md), [UI/UX](design/UI_UX.md) |
| Hiểu thiết kế và quyền sở hữu dữ liệu | [Kiến trúc](design/ARCHITECTURE.md), [ranh giới service](design/SERVICE_BOUNDARIES.md), [database](design/DATABASE.md), [kiến trúc frontend](design/FRONTEND_ARCHITECTURE.md), [ADR](adr/) |
| Tích hợp HTTP, WebSocket hoặc event | [Quy tắc hợp đồng](api/API_CONTRACTS.md), [OpenAPI](api/openapi.yaml), [JSON Schema sự kiện](api/events.yaml) |
| Tích hợp Pose hoặc RAG | [Kết nối ba nhánh GitHub](guides/AI_HANDOFF.md), [thiết kế tích hợp AI](design/AI_INTEGRATION.md), [hợp đồng Catalog–RAG](api/catalog-rag-handoff.yaml) |
| Cấu hình service, bảo mật và phục hồi | [Runbook](guides/OPERATIONS.md), [bảo mật](design/SECURITY.md), [phiên bản công nghệ](guides/TECHNOLOGY_VERSIONS.md) |
| Chọn việc hoặc xác minh nghiệm thu | [Roadmap](planning/IMPLEMENTATION_PLAN.md), [trạng thái từng task](planning/TASKS.md), [kế hoạch kiểm thử](planning/TEST_PLAN.md), [ma trận truy vết](planning/TRACEABILITY.md), [checkpoint](planning/AUTO_CHECKPOINT.md) |

## Báo cáo và đề xuất

- [Kiểm kê nguồn và tái sử dụng](reviews/REPOSITORY_AUDIT.md)
- [Review bàn giao thiết kế](reviews/DESIGN_REVIEW.md)
- [Backend audit](reviews/BACKEND_AUDIT.md)
- [Frontend audit](reviews/FRONTEND_CODEBASE_AUDIT.md)
- [Đề xuất thiết kế lại Web](reviews/WEB_UI_REDESIGN.md)

Báo cáo phản ánh baseline tại thời điểm rà soát. Trạng thái nghiệm thu tra theo [TASKS.md](planning/TASKS.md). Lệnh cài đặt và vận hành tra theo hướng dẫn Docker và runbook ở trên.
