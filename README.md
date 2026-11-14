# SmartGym Web

SmartGym là nền tảng tập luyện tiếng Việt gồm thư viện bài tập và bản đồ cơ, quản lý chương trình và lịch tập, nhật ký tiến độ, phòng tập Pose AI, trợ lý hỏi đáp và CMS quản trị nội dung.

## Chạy trên máy mới

Đọc [hướng dẫn cài đặt bằng Docker](docs/guides/GETTING_STARTED.md) để chuẩn bị cấu hình, dữ liệu và tài sản AI rồi mở [SmartGym cục bộ](https://127.0.0.1:3100). Bản clone có mã nguồn và migration. Tài khoản, bài tập đã nhập, tệp media và model AI cần được chuẩn bị riêng.

Thành viên phụ trách Pose hoặc RAG xem [hướng dẫn bàn giao AI](docs/guides/AI_HANDOFF.md) để lấy đúng nhánh và kết nối với Web.

## Cấu trúc repository

| Thư mục | Nội dung |
|---|---|
| [frontend/](frontend/) | Next.js App Router, giao diện người dùng, CMS và BFF |
| [backend/services/](backend/services/) | Sáu API NestJS gồm Identity, Catalog, Workout, Progress, Notification và Pose. RAG chạy từ nguồn bàn giao. |
| [infra/](infra/) | Docker Compose, Dockerfiles và cấu hình hạ tầng |
| [scripts/](scripts/) | Chuẩn bị cấu hình, xác minh hợp đồng và vận hành |
| [tests/](tests/) | Kiểm thử hợp đồng, tích hợp, hệ thống và trình duyệt |
| [docs/](docs/README.md) | Hướng dẫn chạy, thiết kế hệ thống và trạng thái nghiệm thu |

Khi sửa mã, đọc [hướng dẫn phát triển, kiểm thử](docs/guides/DEVELOPMENT.md). Xem tình trạng từng tính năng ở [bảng công việc](docs/planning/TASKS.md).
