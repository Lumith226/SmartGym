# ADR 0016 — Workout Planner và BFF

ACCEPTED trong T16 theo quyền tiếp tục thực hiện các task. Giữ cơ chế xác thực [ADR 0005](0005-web-auth-bff.md) và nghiệp vụ [ADR 0013](0013-workout-plan-implementation.md), [0014](0014-workout-schedule-time.md), [0015](0015-workout-schedule-reconciliation.md).

## Trách nhiệm và hợp đồng

Next.js dựng trang riêng sau requireProfile. Client components xử lý editor, picker, agenda, xem tuần, rule và chi tiết buổi. Không giữ database hoặc thực hiện ghi nghiệp vụ trong frontend. Thêm liên kết từ tài khoản đến `/app/chuong-trinh` và `/app/lich`, các route chi tiết lấy UUID đã kiểm. Return URL cho phép chính xác các route này và từ chối URL ngoài hoặc path traversal.

BFF custom server allowlist 14 operation Workout và GET listExercises của Catalog, schema sinh từ OpenAPI bằng sync-web-workout-contract.mjs. Workout dùng HTTPS/mTLS với origin/certificate được cấu hình riêng. Mỗi request introspect Identity để lấy assertion mới giữ server-side, không forward cookie, Authorization hoặc role header của browser. Kiểm Host/Origin/CSRF, path/query/body/header và response. Không follow redirect hoặc tự retry command. Giữ ETag, Location đã kiểm và lỗi nghiệp vụ an toàn, chỉ chuyển detail overlap có giới hạn từ Workout. HTTP 204 không parse JSON. Payload request tối đa 64 KiB và response 2 MiB, deadline Workout 7 giây.

GET `/api/v1/exercises` công khai chỉ proxy Catalog origin cố định và query đúng hợp đồng. Không gửi cookie/assertion tới Catalog public. Deadline ba giây, không chuyển redirect hoặc trả field ngoài schema. Public picker và thư viện không cần Workout hoạt động.

## Trạng thái và thời gian

URL giữ bộ lọc/status/cursor và date/zone/view của lịch. GET abort khi đổi truy vấn, response no-store, không dùng shared cache cho dữ liệu riêng. Form giữ draft, ETag, pending và kết quả trong bộ nhớ. POST create giữ idempotency key cho cùng payload khi thử lại sau lỗi. Thay payload có key mới. Hai tab tranh version trả 412, người dùng giữ draft và chủ động xác nhận trước khi tải phiên bản mới. Điều hướng khi đang có draft cần xác nhận, không ghi vào localStorage. Không tự gửi lại lệnh sau đăng nhập.

Agenda mặc định trên mobile, chế độ tuần có cùng các liên kết chi tiết và không kéo thả bắt buộc. Thứ tự bài đổi bằng nút lên/xuống. Hủy/lưu trữ dùng native modal dialog với tên, mô tả tác động, focus ban đầu ở Quay lại và trả focus khi đóng. Các trạng thái tải/rỗng/lỗi/thành công có chữ và semantics chuẩn.

Frontend dùng cùng `@js-temporal/polyfill` 0.5.1 đã chọn cho Workout, pin độc lập trong manifest/lockfile. Không import source backend. Chuyển ngày giờ local sang instant theo zone IANA thay vì múi giờ hệ điều hành của browser. DST gap lấy instant hợp lệ đầu tiên, fold lấy lần sớm hơn. API/backend vẫn quyết định cuối cùng. Browser/server tzdata có thể khác nhau, bản xem trước giải thích giới hạn. Đầu/cuối tuần là local midnight quy đổi sang UTC, không mặc định bảy ngày bằng 168 giờ.

## Nghiệm thu và vận hành

TST-16 kiểm BFF bằng TLS upstream fixture có tên rõ, thời gian/DST bằng ca contract và UI qua Chromium với Web, Identity, Catalog, Workout, PostgreSQL/RabbitMQ/SMTP sandbox thật. Fixture UI không thay engine hoặc corpus AI. Kiểm owner, CSRF, stale ETag, conflict giữ draft, archive guard, dời/hủy, mobile/keyboard, axe và cô lập lỗi Workout.

T17/T18 triển khai nhật ký và summary. T19/T20 triển khai reminders/inbox, không hiển thị gửi nhắc thành công chỉ vì lưu lịch thành công. T07 và T28/T29 vẫn giữ cổng trợ năng thiết bị thật, quyền phát hành, container và môi trường đích.

Nguồn đọc ngày 2026-11-07: [Next.js cookies](https://nextjs.org/docs/app/api-reference/functions/cookies) đang hiển thị 16.4.5 khớp manifest, [Temporal polyfill](https://github.com/js-temporal/temporal-polyfill) và [W3C modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Installed types và build/browser tests là bằng chứng cho artifact đã pin.
