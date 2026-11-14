# ADR 0014 — Quy tắc thời gian và tính nguyên tử của lịch tập

ACCEPTED trong phạm vi T14 theo quyền tiếp tục các task đã được giao. Cụ thể hóa WKT-002/WKT-003 trong ADR 0001 và giữ hợp đồng user flow.

Chọn `@js-temporal/polyfill` 0.5.1 cho runtime Node 24.22.1 hiện chưa có Temporal toàn cục. Kiểm installed type definitions, thử DST New York và pin integrity trong lockfile. Dùng thời gian IANA và ngày địa phương cho rule, lưu instant UTC cho occurrence. Giờ lặp chọn instant sớm hơn. Giờ thiếu dùng transition kế tiếp từ thời điểm earlier để lấy instant hợp lệ đầu tiên, gồm cả ngày địa phương bị bỏ qua. Cần kiểm thử riêng trước khi bật các vùng đích. [Temporal polyfill](https://github.com/js-temporal/temporal-polyfill)

Horizon là 35 ngày địa phương tính từ ngày hiện tại trong múi giờ lịch. Ngày kết thúc nếu có được bao gồm. Chỉ tạo occurrence bắt đầu sau thời điểm xử lý. ONCE có thể ở ngoài horizon và được materializer tạo khi đến cửa sổ. ONCE dùng một ngày, WEEKLY dùng ISO weekday. Occurrence key lưu ngày và giờ rule gốc để xử lý DST và retry ổn định.

Mọi thao tác ghi lịch và archive plan dùng khóa giao dịch theo owner trước khi khóa plan. Database ràng buộc occurrence SCHEDULED không chồng khoảng `[startAt,endAt)` của cùng owner bằng GiST exclusion. Hai khoảng tiếp giáp được phép. Tạo rule, các occurrence trong cửa sổ và outbox event cùng transaction. Nếu tạo thủ công gặp chồng lịch, rollback toàn bộ và trả 409 kèm occurrence liên quan. [PostgreSQL 18 range constraints](https://www.postgresql.org/docs/18/rangetypes.html) · [btree_gist](https://www.postgresql.org/docs/18/btree-gist.html)

Plan snapshot được chụp khi tạo lịch, giữ riêng với sửa plan sau đó. T15 triển khai chỉnh/hủy và khôi phục materializer, phải giữ ID/key và lịch sử quá khứ. Event lưu bền cùng giao dịch. Relay Workout dùng publisher confirm, mandatory routing, lease và token fencing theo ADR 0004. Consumer reminders và dedup thuộc T19. Chưa chạy broker không ngăn lưu lịch, outbox giữ event PENDING cho tới khi có xác nhận và đường routing phù hợp.
