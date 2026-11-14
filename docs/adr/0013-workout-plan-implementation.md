# ADR 0013 — Workout plan và đối chiếu Catalog

ACCEPTED cho T13 theo quyền tiếp tục triển khai các task độc lập đã được giao. Giữ ranh giới Workout trong ADR 0001.

Workout dùng package NestJS riêng, database/role riêng và listener mTLS. Chỉ certificate BFF trong allowlist cùng assertion Identity còn hạn và email đã xác minh được đọc/ghi kế hoạch của owner. ADMIN cũng chỉ thao tác kế hoạch của chính mình. Auth BFF cho planner thuộc T16.

Catalog triển khai `POST /internal/v1/catalog/exercise-refs` trên listener mTLS riêng đang phục vụ CMS, với allowlist certificate cho tra cứu refs tách khỏi ADMIN. Route chỉ trả ID, trạng thái còn công bố và tên công khai. Workout gọi hợp đồng này khi tạo hoặc sửa plan. Đọc plan dùng snapshot đã lưu, giữ tên khi bài bị gỡ. Sửa plan được giữ bài đã có từ phiên bản đọc, thêm mới chỉ nhận ID đang công bố. Việc gỡ Catalog đồng thời sau phản hồi refs có thể xảy ra trước commit Workout. Snapshot ghi lại nội dung đã xác minh, lần chọn mới kiểm lại nguồn.

Tạo plan dùng receipt idempotency owner/key 24 giờ, fingerprint canonical và giao dịch nguyên tử cho plan/items/receipt. Replay đọc receipt trước khi gọi Catalog để chịu được lỗi Catalog sau lần tạo thành công. PUT thay thế dùng If-Match, khóa plan và chỉ ghi khi đúng version. DELETE lưu trữ theo version. Migration T14 phải bổ sung kiểm schedule đang hoạt động trong cùng khóa plan trước khi cho archive hoặc tạo schedule.

Plan items lưu thứ tự, tên snapshot, số set và đúng một mục tiêu rep hoặc thời lượng. Không có foreign key sang database Catalog hoặc Identity. Lịch và occurrence triển khai ở T14/T15 với migration tiếp theo. Runtime giữ database có giới hạn thời gian, readiness kiểm migration và DB, Catalog/Identity lỗi chỉ ảnh hưởng operation cần gọi phụ thuộc tương ứng.
