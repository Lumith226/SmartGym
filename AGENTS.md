# Hướng dẫn làm việc trong SmartGym Web

## Phạm vi và thứ tự đọc

1. Xác minh đường dẫn đích `E:\do an\SmartGym_Web` và kiểm tra thay đổi đang có. Đọc [Master Prompt](MASTER_PROMPT_SMARTGYM.md), [README](README.md) và mọi `AGENTS.md` áp dụng. Nguồn Pose/Catalog legacy là `E:\do an\SmartGym`, nguồn RAG là `E:\do an\smart-gym-ai\services\kb_rag`, đều chỉ đọc khi làm Web. Đọc [ADR 0008](docs/adr/0008-ai-provider-handoff.md) và [AI integration](docs/design/AI_INTEGRATION.md) trước task AI. RAG cũ trong SmartGym không dùng cho tích hợp mới.
2. Đọc [roadmap](docs/planning/IMPLEMENTATION_PLAN.md) và [tasks](docs/planning/TASKS.md). Dùng [ma trận truy vết](docs/planning/TRACEABILITY.md) để tìm requirement, chủ sở hữu, hợp đồng, schema và ca test. Đọc ADR, bảo mật và quy tắc triển khai liên quan trước khi sửa mã.
3. `PHASE=PLANNING` chỉ ghi Markdown và YAML thiết kế ở các đường dẫn trong master prompt. Chỉ chạy lệnh đã hiểu tác dụng phụ. Công cụ sinh cache, sửa repo, cài dependency hoặc chạy runtime legacy nằm ngoài chế độ này. Nếu phép kiểm tra cần công cụ chưa có hoặc có tác dụng phụ chưa rõ, ghi `NOT RUN` và lý do.
4. `PHASE=IMPLEMENTATION` cần mã task/mốc được giao. `PHASE=AUTO` cần mốc đích, đối chiếu M0 và chọn task đủ điều kiện trong phạm vi. Giữ thay đổi sẵn có của người dùng. Thao tác push, phát hành, môi trường dùng chung và thay đổi phá hủy cần quyền riêng.

## Làm một task

Với runtime AI cục bộ, đọc ADR 0010 và Operations trước khi chạy tools. Dùng locks infra/ai và cache/temp .local/ai, không install global hay dùng Python hệ thống theo suy đoán. Không sync venv đang chạy. T21 nhận engine không cho phép mở provider ra mạng: T22/T23 phải bổ sung owner/auth/mTLS. Không thay corpus thiếu bằng fixture tổng hợp để đánh dấu chatbot sẵn sàng. Raw benchmark observations chỉ ở .local, không commit hoặc đưa vào UI như dữ liệu người dùng.

Frontend ở `frontend/`, các backend service ở `backend/services/<service>/`. Mỗi phần có manifest/build riêng và dùng hợp đồng để giao tiếp. Công cụ import-boundary phải chặn đường dẫn mã nguồn chéo frontend/backend hoặc chéo service. Tests ở root có thể dùng entrypoint service để kiểm thử tích hợp. Đọc `pnpm-workspace.yaml` và lockfile trước khi đổi đường dẫn.

- Kiểm tra phụ thuộc thật, ghi `IN_PROGRESS` khi bắt đầu. Khi thêm hoặc đổi API/event, cập nhật hợp đồng, consumer và test tương ứng. Khi đổi ranh giới, cập nhật ADR, tài liệu database và ma trận. Mỗi kho chỉ do service sở hữu ghi. Dùng client/hợp đồng ở biên service. Thư viện chung chỉ dùng cho hợp đồng và tiện ích kỹ thuật.
- Sửa nhỏ, bảo toàn hành vi đang dùng, xử lý input cũ và xem xét đồng thời, retry, lỗi giữa chừng. Dùng dữ liệu thật đã duyệt cho nghiệm thu tích hợp. Kiểm thử cô lập có thể dùng fixture hoặc fake được đặt tên rõ.
- Chạy kiểm tra theo service trước, sau đó contract và E2E bị ảnh hưởng. Dùng các lệnh đã được thiết lập trong repo. Ghi lệnh, môi trường và kết quả `PASS`, `FAIL`, `NOT RUN`. Với lỗi, tái hiện, xác định biên lỗi, sửa nguyên nhân, chạy lại và giữ bằng chứng. Nếu thiếu quyền, dữ liệu hoặc phụ thuộc, ghi blocker và chuyển phần độc lập.
- `TASKS.md` là nguồn chuẩn trạng thái nghiệm thu. Chỉ dùng `DONE` khi đạt tất cả tiêu chí. Cập nhật README hoặc runbook nếu cách chạy thay đổi.

## Tài liệu chính thức và quyết định công nghệ

Ưu tiên yêu cầu người dùng đã xác nhận, ADR ACCEPTED và hợp đồng đã chốt cho quyết định sản phẩm/kiến trúc. Khi kiểm tra hành vi framework, dùng tài liệu chính thức đúng phiên bản, installed definitions/source và phép thử có thể tái lập trong môi trường xác định. Phân tích nguồn mâu thuẫn trước khi kết luận. Kiến thức nhớ sẵn chỉ là gợi ý để kiểm tra.

Ghi URL, phiên bản, ngày kiểm tra và bằng chứng tại [bảng phiên bản](docs/guides/TECHNOLOGY_VERSIONS.md). Manifest/lockfile xác lập PINNED, tách khỏi INSTALLED, BUILD_VERIFIED và RUNTIME_VERIFIED. Nếu chưa có manifest/lockfile thì ghi NOT_PINNED và lập task pin ở bước bootstrap. Tài liệu rolling không xác lập tương thích cho bản cũ. Trong Planning chỉ đọc/ghi tài liệu, không cài dependency hoặc công cụ.

Nếu một thay đổi mâu thuẫn ADR ACCEPTED, ghi mâu thuẫn và ảnh hưởng requirement/API/database/task, đề xuất ADR mới và chỉ BLOCKED phần phụ thuộc. Căn cứ chấp thuận có thể là quyết định người dùng hoặc quyền quyết định kỹ thuật đã được giao rõ trong phạm vi. Tiếp tục phần độc lập. Không nâng framework ngoài task được giao.

Prisma và Tailwind CSS chưa được chọn. Trước khi dùng, đánh giá trong ADR. Nếu chọn Prisma, quản lý và kiểm thử SQL thủ công cho ràng buộc PostgreSQL cần thiết không biểu diễn được trong schema, như GiST exclusion khi nghiệp vụ yêu cầu.

## Tiếp tục AUTO

Lưu checkpoint tại `docs/planning/AUTO_CHECKPOINT.md` khi bắt đầu task, sau mỗi lần xác minh quan trọng và trước khi dừng. Ghi mốc đích, mốc/task hiện tại, việc hoàn thành, file đã sửa, lệnh và kết quả kiểm tra gần nhất, blocker và task kế tiếp có thể chạy. Ghi đường dẫn và định danh bằng chứng, bỏ token và dữ liệu cá nhân.

Khi tiếp tục, đối chiếu đường dẫn, Git/danh sách file, thay đổi của người dùng, trạng thái task và kết quả kiểm tra trước khi tin checkpoint. Một task làm dở vẫn giữ `IN_PROGRESS` hoặc `BLOCKED`. Planning kết thúc bằng [review tài liệu](docs/reviews/DESIGN_REVIEW.md). Development kết thúc bằng bằng chứng theo phạm vi đã giao.
