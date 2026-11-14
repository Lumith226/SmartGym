# ADR 0027 — Nest CLI Monorepo Mode cho backend

**ACCEPTED, 2026-11-14.** Người dùng yêu cầu áp dụng cấu trúc Nest CLI Monorepo Mode cho backend. Quyết định này cập nhật bố cục mã từ [ADR 0001](0001-service-boundaries.md).

Khai báo sáu ứng dụng trong `backend/nest-cli.json` với `monorepo: true` và mã nguồn tại `backend/apps/<service>/`. Catalog là ứng dụng mặc định. Dùng Nest CLI 12.0.13 với builder `tsc` và tsconfig riêng để mỗi ứng dụng tiếp tục phát sinh `dist/main.js`, migration và các entrypoint worker hoặc relay đã có. [Nest CLI Workspaces](https://docs.nestjs.com/cli/monorepo)

Giữ manifest theo ứng dụng để pnpm quản lý phụ thuộc trong cùng workspace với Next.js. Các Docker image tiếp tục build theo ứng dụng. Mỗi ứng dụng giữ cấu hình runtime, migration, database owner và hợp đồng hiện hành. Pose Engine Python đi cùng app Pose và RAG dùng nguồn bàn giao ngoài workspace Nest CLI.

Giữ nguyên đường dẫn cũ và chỉ thêm CLI sẽ ít sửa script hơn nhưng không thể hiện bố cục `apps/` đã yêu cầu. Chạy schematic chuyển đổi tự động sẽ không xử lý đúng các ứng dụng và entrypoint hiện có. Di chuyển có kiểm soát giữ nguyên tên package, port và tên Compose service. Chỉ tạo `libs/` khi có mã dùng chung rõ ràng.

Khi thêm ứng dụng, cập nhật workspace, dự án Nest CLI, Docker và kiểm tra biên import. Đối chiếu artifact của tất cả entrypoint nếu thay đổi builder.
