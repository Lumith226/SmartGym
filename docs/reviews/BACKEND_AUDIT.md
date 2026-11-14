# Backend Audit — SmartGym Web

Baseline: commit `4b1bfc0` cùng các thay đổi hiện có trong working tree. Phạm vi gồm sáu service NestJS, Next.js BFF, Docker Compose, PostgreSQL migrations, RabbitMQ, hai biên AI và mã provider đọc từ hai thư mục bàn giao. Báo cáo đánh giá mã và cấu hình hiện có; không suy từ đó ra trạng thái mọi container đang chạy.

**Kết luận.** Giữ cách chia service và database hiện tại. Ưu tiên thống nhất chính sách của hai đường Pose, thu hồi secret Google đã chia sẻ và tách quyền PostgreSQL trước khi triển khai ngoài máy local. Không có phát hiện **Critical** được xác minh trong phạm vi này. Điều đó không thay thế kiểm tra runtime hay rà advisory dependency theo đúng image sẽ phát hành.

**Cách phân loại.** “Đã xác minh” nghĩa là có đường mã, cấu hình hoặc hợp đồng thể hiện hành vi. “Rủi ro” nghĩa là đã thấy điều kiện dẫn đến vấn đề, nhưng chưa chứng minh tác động trên môi trường chạy. “Cải tiến” là công việc bảo trì có bằng chứng và không phải lỗi nghiệp vụ.

## 1. Kiến trúc, API và nghiệp vụ

| Phần | Quyền sở hữu và đường gọi đã rà | Kiểm soát đáng giữ |
|---|---|---|
| Web BFF | Cổng browser; phân tuyến Catalog, Auth/Google, Workout, Progress, Notification, Pose, Chat và media. | Kiểm tra Origin/CSRF cho mutation, lọc phản hồi theo hợp đồng, cookie host-only; route nội bộ không chuyển tiếp tùy ý. [Phân tuyến](../../frontend/server.mjs#L40) · [Kiểm tra request](../../frontend/server/auth.mjs#L46) |
| Identity | Tài khoản, credential, phiên, role, email action và outbox riêng. | Argon2id, token action một lần, kiểm phiên và credential version; đổi role thu hồi phiên. Google kiểm state, nonce, PKCE, chữ ký, issuer/audience và quyền đối với email; tài khoản trùng email trả xung đột thay vì tự liên kết. [Nghiệp vụ Identity](../../backend/apps/identity/src/modules/accounts/identity.service.ts#L76) · [Google](../../frontend/server/google-auth.mjs#L23) |
| Catalog | Thư viện public; CMS, taxonomy, media, revision, audit, import/export và feed nội bộ. | Listener quản trị kiểm mTLS và ADMIN; caller của refs/feed tách riêng. Public đọc bản công bố. Ghi publication, audit và outbox trong transaction; If-Match và idempotency áp dụng cho thao tác tương ứng. Media kiểm hash, version, MIME, ClamAV và decoder trước khi chuyển READY. [Biên API](../../backend/apps/catalog/src/admin-app.ts#L24) · [Xác minh media](../../backend/apps/catalog/src/modules/media/media-jobs.ts#L20) |
| Workout | Plan, lịch, occurrence, conflict, outbox; hỏi Catalog qua API refs. | Truy vấn có owner; GiST chống chồng lịch ngay ở PostgreSQL; snapshot và thay đổi occurrence có version. [Lịch](../../backend/apps/workout/src/modules/scheduling/schedule-changes.service.ts#L83) · [Ràng buộc](../../backend/apps/workout/migrations/002_workout_schedules.sql#L18) |
| Progress | Log, set, thống kê và bản tóm tắt kết quả được người dùng nhập. | Xác nhận nguồn qua API nội bộ; unique index theo owner chống nhập trùng occurrence/Pose; log và receipt được ghi trong cùng transaction. [Luồng ghi](../../backend/apps/progress/src/modules/logs/logs.service.ts#L47) · [Schema](../../backend/apps/progress/migrations/001_workout_logs.sql#L2) |
| Notification | Preferences, inbox, projection lịch, job gửi và attempt. | Consumer xác thực envelope, ACK sau khi lưu; kiểm version và preference trước gửi; phân biệt trạng thái gửi mơ hồ để tránh tự gửi lặp. [Consumer](../../backend/apps/notification/src/broker.ts#L14) · [Reminder](../../backend/apps/notification/src/modules/inbox/reminders.ts#L138) |
| Pose | NestJS sở hữu upload, job, phiên live, result và retention. FastAPI chạy inference. BFF còn đường Pose Studio gọi engine trực tiếp. | Luồng NestJS có owner, consent version, giới hạn, checksum, pin object version, lease và kiểm caller. Cần áp dụng chính sách tương đương cho đường Studio. [API Pose](../../backend/apps/pose/src/modules/pose-status.module.ts#L18) · [Job](../../backend/apps/pose/src/modules/analysis/pose-jobs.service.ts#L32) · [Studio](../../frontend/server/pose-studio.mjs#L15) |
| RAG | Provider FastAPI đọc index riêng, Ollama thực hiện inference. BFF gọi provider và kiểm trích dẫn. | Health/revision pin, deadline, giới hạn đồng thời, danh sách nguồn duyệt và kiểm lại policy trước khi trả citation. Catalog đã có producer nhưng chưa có consumer được nghiệm thu. [BFF Chat](../../frontend/server/chat.mjs#L18) · [Compose RAG](../../infra/compose.yaml#L98) |

Database của từng service có migration được đánh checksum và khóa khi áp dụng. Mã Workout/Progress lấy tham chiếu qua API; các unique index và khóa thuộc database sở hữu dữ liệu. RabbitMQ phục vụ các luồng có retry và replay, như email, nhắc lịch và publication. Không thấy nhu cầu bổ sung broker hay tách thêm service để xử lý các vấn đề dưới đây.

Kiểm kê OpenAPI theo service: Catalog 37, Identity 16, Workout 15, Progress 7, Pose 11, Notification 4 và RAG 2. Ngoài hợp đồng đó, entrypoint còn có các tuyến riêng cho Google OAuth, media gateway và Pose Studio. Kiểm tra 92 operation là kiểm cấu trúc hợp đồng và các bản sinh, không phải 92 HTTP smoke test.

## 2. Phát hiện chi tiết

### BA-01 · High · Đã xác minh từ mã — Pose Studio không áp dụng cùng chính sách với Pose jobs

- **Vị trí:** [Cấu hình bật engine trực tiếp](../../infra/compose.yaml#L479), [HTTP Studio](../../frontend/server/pose-studio.mjs#L30), [WebSocket Studio](../../frontend/server/pose-studio.mjs#L82), [Luồng có consent và quota](../../backend/apps/pose/src/modules/analysis/pose-jobs.service.ts#L32), [Phiên live chuẩn](../../backend/apps/pose/src/modules/live/live-store.ts#L15).
- **Bằng chứng và ảnh hưởng:** BFF Studio kiểm phiên, kích thước multipart và giới hạn đồng thời theo process rồi truyền sang engine. Đường live xác thực khi mở và có cơ chế kiểm phiên ở relay. Hai đường Studio không tạo reservation/job/live session theo owner hoặc ghi consent version như API Pose NestJS. HTTP trực tiếp cho phép khoảng 201 MiB multipart, trong khi schema upload job giới hạn tệp 100 MiB. Khác biệt này làm cho kiểm toán quyền riêng tư, quota và khả năng lưu kết quả phụ thuộc vào màn hình người dùng chọn. Không có bằng chứng video đã bị lưu sai hay bị lộ.
- **Khắc phục:** Giữ giao diện Studio và định tuyến qua nghiệp vụ Pose chung. Nếu cần chế độ phân tích tức thời riêng, dùng session/job tạm có owner, consent version, giới hạn và chính sách lưu/xóa rõ ràng. Kiểm thử trên chính route browser đang dùng.

### BA-02 · High · Đã xác minh sự kiện chia sẻ — Google OAuth client secret đã được gửi trong cuộc trao đổi

- **Vị trí:** [Đọc secret phía BFF](../../frontend/server/google-auth.mjs#L14), [Trao đổi token](../../frontend/server/google-auth.mjs#L80).
- **Bằng chứng và ảnh hưởng:** Người dùng từng gửi client secret trong chat. Không có bằng chứng giá trị đó đã bị dùng sai, còn hiệu lực, hoặc đã được xoay. Đây là credential của OAuth client, không phải mật khẩu Google hay session người dùng.
- **Khắc phục:** Kiểm tra trạng thái secret trên Google Cloud, xoay và thu hồi giá trị đã chia sẻ nếu còn hiệu lực, cấu hình secret file phía BFF, xác minh một lượt đăng nhập thật. Không đưa giá trị cũ vào báo cáo, log hoặc lịch sử Git.

### BA-03 · High khi đưa ra môi trường dùng chung · Rủi ro cấu hình — Quyền runtime PostgreSQL chưa tách khỏi quyền quản trị

- **Vị trí:** [POSTGRES_USER của các cụm](../../infra/compose.yaml#L121), [URL mẫu](../../.env.example#L10), [Catalog startup](../../infra/compose.yaml#L205), [Audit trigger](../../backend/apps/catalog/migrations/003_exercise_cms.sql#L31).
- **Bằng chứng và ảnh hưởng:** URL mẫu dùng cùng tài khoản với `POSTGRES_USER`, và command khởi động dùng cùng môi trường cho migrate và runtime. Nếu môi trường thực tế theo mẫu, app/worker kết nối bằng role bootstrap của cụm, làm giảm hiệu lực phòng vệ của các trigger và quyền hạn schema khi tiến trình bị xâm phạm. Chưa kiểm tra grants hoặc role của volume đang chạy.
- **Khắc phục:** Cấp role migrate/owner riêng. Runtime nhận đúng quyền DML cần thiết; worker chỉ có quyền cho bảng mình xử lý. Thử bằng credential runtime rằng thao tác ghi ngoài phạm vi và DDL bị từ chối.

### BA-04 · Medium · Đã xác minh lệch nghiệp vụ — Tìm bài theo mã hoặc slug không đúng mô tả CMS

- **Vị trí:** [Ô tìm kiếm](../../frontend/app/admin/exercise-list.tsx#L60), [Điều kiện SQL](../../backend/apps/catalog/src/modules/exercises/admin-exercise-store.ts#L98), [Cột tìm kiếm](../../backend/apps/catalog/migrations/002_catalog_search.sql#L9).
- **Bằng chứng và ảnh hưởng:** Giao diện ghi “Tên, mã hoặc slug”, nhưng `search_key` chỉ ghép `nameVi` và `nameEn`. Từ khóa chỉ có trong ID/slug bị loại nếu không tình cờ trùng tên. Số trang cũng phản ánh kết quả thiếu đó.
- **Khắc phục:** Bổ sung điều kiện khớp ID và slug trên bản quản trị đang đọc, dùng chung predicate cho đếm và lấy trang. Thêm ca kiểm theo ID, slug, tên không dấu và trạng thái.

### BA-05 · Medium · Đã xác minh khoảng trống triển khai — Compose báo process đã khởi động trước khi kiểm chức năng

- **Vị trí:** [Phụ thuộc Web](../../infra/compose.yaml#L488), [Migration khi khởi động](../../infra/compose.yaml#L232), [Probe Workout](../../backend/apps/workout/src/modules/workout-health.module.ts#L6), [Probe Notification](../../backend/apps/notification/src/modules/notification-health.module.ts#L7).
- **Bằng chứng và ảnh hưởng:** PostgreSQL và broker có healthcheck trong Compose, nhưng Web chờ các API bằng `service_started`. Một process đang migrate, chưa bắt đầu listen hoặc provider chưa nạp index vẫn có thể để Compose tiếp tục khởi động Web. Lỗi thể hiện dưới dạng gián đoạn ngắn hoặc tính năng không sẵn sàng. Chưa đo cold start ở lượt audit.
- **Khắc phục:** Thêm probe cấp ứng dụng dùng đúng mTLS. Chỉ chờ readiness của dependency bắt buộc. Báo Pose/RAG ở trạng thái suy giảm riêng để người dùng vẫn truy cập được thư viện.

### BA-06 · Medium · Rủi ro tài nguyên — Video batch và camera Pose tranh cùng tài nguyên suy luận

- **Vị trí:** [BFF giới hạn upload/stream](../../frontend/server/pose-studio.mjs#L27), provider `E:/do an/SmartGym/smart_gym_web_v4/server/app.py:30,114,134–156`, [Cấu hình engine](../../infra/compose.yaml#L77).
- **Bằng chứng và ảnh hưởng:** Engine dùng một lock cho inference frame và toàn bộ video batch, cả hai đi vào cùng engine CPU. Có giới hạn byte và số kết nối, nhưng chúng không bảo đảm deadline cho camera khi có batch. Compose mẫu chưa đặt giới hạn CPU/bộ nhớ cho engine. Không đo mức chậm hoặc mức tiêu thụ thực tế.
- **Khắc phục:** Đo camera đồng thời batch với video đại diện và đặt ngân sách thời lượng, độ phân giải, số frame, hàng chờ và tài nguyên. Tách pool batch/live nếu vượt SLO; giữ điều phối job ở Pose service.

### BA-07 · Medium · Đã xác minh thiếu kiểm soát vòng đời — Bản ghi hết hạn Catalog có thể tiếp tục chiếm chỗ

- **Vị trí:** [Dọn receipt theo đúng key gọi lại](../../backend/apps/catalog/src/modules/admin/admin-store.ts#L43), [Export hết hạn](../../backend/apps/catalog/src/modules/transfers/admin-imports.service.ts#L160), [Feed snapshot TTL](../../backend/apps/catalog/src/modules/feed/catalog-feed.service.ts#L35), [Runbook](../guides/OPERATIONS.md#admin-dashboard-t12).
- **Bằng chứng và ảnh hưởng:** Receipt hết hạn chỉ bị dọn khi gặp lại đúng key trong code hiện tại. Export/feed kiểm hạn để quyết định có trả nội dung, và worker media xử lý object theo quy tắc riêng. Không thấy tác vụ quét định kỳ các bảng receipt/export/feed trong runtime đã rà. Có thể tăng dung lượng DB và thời gian backup. Không đồng nhất TTL phục vụ với xóa vật lý.
- **Khắc phục:** Chốt retention riêng từng bảng, bảo toàn audit và publication tombstone, purge theo batch có chỉ số và runbook. Giữ cửa sổ replay đã công bố.

### BA-08 · Medium · Rủi ro hiệu năng — Tìm kiếm Catalog và khóa phiên Identity có thể trở thành nút nghẽn

- **Vị trí:** [Catalog COUNT/OFFSET](../../backend/apps/catalog/src/modules/exercises/admin-exercise-store.ts#L98), [Index public](../../backend/apps/catalog/migrations/002_catalog_search.sql#L9), [Identity session](../../backend/apps/identity/src/modules/accounts/identity.service.ts#L142).
- **Bằng chứng và ảnh hưởng:** Trang đánh số tìm substring với `strpos`, đếm toàn bộ kết quả rồi sắp xếp/cắt trang. Index keyset public không phục vụ điều kiện substring này. Identity dùng `FOR UPDATE` trên user và session ở mỗi lần introspect; yêu cầu đồng thời của cùng user có thể xếp hàng. Chưa có `EXPLAIN` trên dữ liệu đích hay đo lock wait nên chưa kết luận chậm.
- **Khắc phục:** Đo truy vấn ở cardinality thực tế, chỉ thêm index substring nếu cần và khớp biểu thức truy vấn. Với Identity, đo contention trước khi đổi cơ chế touch session; kiểm thử lại race thu hồi quyền, logout, reset password và idle expiry.

### BA-09 · Medium · Đã xác minh khoảng trống quan sát — Request ID không xuyên suốt và lỗi thường bị gom chung

- **Vị trí:** [BFF tạo Problem](../../frontend/server/auth.mjs#L13), [Catch tại entrypoint](../../frontend/server.mjs#L94), [Problem Catalog](../../backend/apps/catalog/src/catalog-problem-filter.ts#L4), [Worker Notification](../../backend/apps/notification/src/main.ts#L18).
- **Bằng chứng và ảnh hưởng:** Catalog sinh UUID ở filter, BFF sinh UUID mới khi trả Problem; một số catch chỉ trả 503 hoặc log câu retry chung. Không thể dùng riêng mã lỗi người dùng thấy để nối một sự cố xuyên Web, service và worker. Có error codes và audit nghiệp vụ, nhưng chúng phục vụ mục đích khác.
- **Khắc phục:** Chuẩn hóa correlation ID do Web cấp và được chuyển tiếp nội bộ, structured log theo route/service/outcome/duration, log nguyên nhân nội bộ đã lọc và thêm metric queue lag, DLQ, lease hết hạn, DB wait. Giữ bí mật, media và nội dung hội thoại ngoài log.

### BA-10 · Medium · Đã xác minh khoảng trống nghiệp vụ — RAG chưa phản ánh vòng đời bài CMS

- **Vị trí:** [Feed Catalog](../../backend/apps/catalog/src/modules/feed/catalog-feed.service.ts#L28), [Compose RAG index](../../infra/compose.yaml#L107), [BFF allowlist](../../frontend/server/chat.mjs#L24), [Bộ tạo chỉ mục](../../scripts/prepare-compose-rag-index.mjs#L5).
- **Bằng chứng và ảnh hưởng:** Catalog có head/snapshot/outbox, nhưng Compose gắn index nguồn bàn giao dạng chỉ đọc. BFF hiện từ chối nguồn `ex_` hoặc `catalog:`. Publish, cập nhật hay gỡ bài trong CMS không làm thay đổi nội dung chatbot hiện có. Handoff validator báo `UNCONFIRMED`. Chưa thấy dữ liệu Catalog đã gỡ xuất hiện trong RAG đang chạy.
- **Khắc phục:** Khi cần tìm bài qua chatbot, nghiệm thu consumer có dedup, reconcile, xử lý tombstone và kích hoạt index theo revision trước khi đổi allowlist. Với câu hỏi về bài đang xem, có thể lấy context trực tiếp từ bản public qua Catalog theo ID.

### BA-11 · Medium · Đã xác minh khoảng trống kiểm thử — Lệnh mặc định không bao phủ toàn bộ service hoặc tuyến mới

- **Vị trí:** [Scripts](../../package.json#L8), [Pose integration](../../tests/integration/pose.test.mjs#L109), [Kế hoạch nghiệm thu](../planning/TASKS.md#L53).
- **Bằng chứng và ảnh hưởng:** `pnpm test` chỉ gọi test Catalog, Identity và Notification. Workout, Progress, Pose và đa số luồng BFF có lệnh riêng; không thấy workflow CI được track trong repository. Tìm kiếm trong `tests` không thấy ca nhắm đích `/api/pose-studio/*` hoặc module media gateway trực tiếp. Có test upload/media và Pose ở các đường chính khác. Compose readiness, quyền DB runtime và tích hợp provider live chưa được suy ra từ các test đó.
- **Khắc phục:** Tạo một cổng CI hợp nhất cho contract/boundaries và kiểm thử nhanh toàn service. Chạy PostgreSQL, RabbitMQ, object storage và tuyến Compose trong job tích hợp riêng. Thêm tuyến Studio/gateway, quyền chéo, lỗi khi dependency ngắt và readiness.

### BA-12 · Low · Cải tiến — Mã hạ tầng kỹ thuật trùng và quy trình build lặp

- **Vị trí:** [Catalog DB](../../backend/apps/catalog/src/database.ts#L1), [Workout DB](../../backend/apps/workout/src/database.ts#L1), [Progress DB](../../backend/apps/progress/src/database.ts#L1), [Pose DB](../../backend/apps/pose/src/database.ts#L1), [Dockerfile Catalog](../../infra/docker/Dockerfile.catalog#L5).
- **Bằng chứng và ảnh hưởng:** Bốn file adapter DB có SHA-256 giống nhau. Nhiều Dockerfile lặp phần copy manifest của toàn workspace. Error filter của các service lặp cấu trúc nhưng khác mapping và authorization. Thay đổi timeout hoặc handling lỗi có thể lệch giữa các service.
- **Khắc phục:** Nếu cần thống nhất, dùng module kỹ thuật cho pool/transaction và quy ước Problem/correlation ID, test theo từng service. Giữ query nghiệp vụ, credential và schema thuộc service. Cân nhắc chuẩn hóa bước build khi có CI.

### BA-13 · Low · Ứng viên dọn mã — Hai đường đọc audit có chức năng chồng nhau

- **Vị trí:** [Hai route](../../backend/apps/catalog/src/modules/exercises/admin-exercises.module.ts#L73), [Adapter audit bài tập](../../backend/apps/catalog/src/modules/exercises/admin-catalog.service.ts#L142), [OpenAPI](../api/openapi.yaml#L2204).
- **Bằng chứng và ảnh hưởng:** `exercise-audit` chuyển tiếp sang `listAudit` với content type cố định, còn CMS dùng `catalog-audit`. Route cũ vẫn có OpenAPI và ca kiểm thử. Không có cơ sở gọi đây là dead code hoặc xóa ngay vì có thể còn client ngoài repo.
- **Khắc phục:** Kiểm usage trước khi deprecate. Giữ alias nếu cần tương thích và xác định một endpoint chuẩn cho client mới.

### BA-14 · Medium · Rủi ro cấu hình/riêng tư — Payload chẩn đoán engine đi qua Studio gần như nguyên trạng

- **Vị trí:** [Forward phản hồi JSON Studio](../../frontend/server/pose-studio.mjs#L55), provider `E:/do an/SmartGym/smart_gym_web_v4/server/app.py:37,45–56`, [Chính sách](../design/SECURITY.md#biên-ai-bàn-giao).
- **Bằng chứng và ảnh hưởng:** Engine lưu chuỗi lỗi startup và đưa trường `error` vào health. BFF Studio kiểm Content-Type nhưng chuyển tiếp response body, không chiếu sang schema health công khai tối giản. Người có phiên có thể nhận chi tiết kỹ thuật nếu engine khởi động lỗi. Chưa kiểm chứng lỗi thực tế có chứa đường dẫn hay secret.
- **Khắc phục:** Chỉ trả trường readiness được phép và mã lỗi ổn định. Ghi chi tiết startup ở log riêng đã lọc. Thêm test fixture lỗi engine và giới hạn phản hồi.

## 3. Thứ tự xử lý

1. **Sửa ngay:** BA-01 và BA-02. Hoàn tất BA-03 trước khi triển khai ngoài localhost. Kèm BA-14 khi chuẩn hóa biên Pose. BA-04 có thể sửa độc lập và kiểm thử nhanh.
2. **Nên refactor:** Hợp nhất chính sách điều phối Pose trước. Sau đó chuẩn hóa correlation/logging và helper hạ tầng đã chứng minh bị trùng. Xác minh client trước khi deprecate alias audit.
3. **Cải tiến sau:** Readiness theo chức năng, purge có giới hạn, ngân sách batch/live, cổng CI chung và consumer Catalog → RAG. Chọn index sau khi có query plan và số liệu tải.
4. **Cần kiểm tra thêm:** Role/grants và image digest thật của từng container; lịch sử xoay secret; PostgreSQL query plans, lock wait, cold start và nhiều replica; khả năng hủy inference, giới hạn decoder/tệp tạm và retention khi storage lỗi; scan advisory theo SBOM của image phát hành; thử backup/restore ngoài Catalog với PostgreSQL, broker và object store; kiểm provider Google/RAG thật và replay Catalog khi provider sẵn sàng. Cần xác nhận cửa sổ backup, RPO/RTO và ACL trên staging.

## 4. Bằng chứng kiểm tra trong đợt audit

- **PASS:** kiểm ranh giới import; validate OpenAPI 3.1 (**92 operation**) và JSON Schema events; đối chiếu toàn bộ hợp đồng sinh trong check:contracts; kiểm cấu hình Compose bằng `config --quiet`.
- **PASS:** **12** ca contract AI/giờ tập/DST và **1** ca Google callback dùng fixture in-memory. Handoff checker qua kiểm tra cấu trúc nhưng báo thỏa thuận với provider **UNCONFIRMED**.
- **Đối chiếu, chưa chạy lại:** bộ PostgreSQL, mTLS, RabbitMQ, S3/ClamAV/FFmpeg, Chromium, load/restore và thử inference đã được ghi trong [Test plan](../planning/TEST_PLAN.md). Không lấy kết quả cũ làm kết quả của lượt audit này. Các test khởi tạo/migrate dữ liệu, tạo container, hoặc dùng dịch vụ ngoài không được chạy trong lượt này.
- **Tác động:** chỉ thêm báo cáo Markdown. Không sửa mã nguồn, cấu hình, dữ liệu hoặc migration. Không gửi request thử lỗi vào hệ thống đang phục vụ.
