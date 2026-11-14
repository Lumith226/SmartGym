# ADR 0025 — Auth.js và liên kết tài khoản Google

**Trạng thái** — `ACCEPTED` cho Web và Identity. Người dùng yêu cầu chuyển sang Auth.js và dùng Google để đăng nhập vào tài khoản SmartGym hiện có cùng email.

## Bối cảnh và phương án

Identity sở hữu user ID, mật khẩu, vai trò và phiên được CMS, Workout, Progress, Notification và Pose sử dụng. Chuyển cả kho phiên sang Auth.js sẽ đòi hỏi đổi cách các thành phần này xác thực. Giữ OAuth tự viết giúp giữ callback cũ nhưng Web tiếp tục phải tự xử lý state, nonce và PKCE.

## Quyết định

- Web dùng `next-auth/react` cho nút Google và `@auth/core` cho provider Google và Credentials. Credentials chuyển yêu cầu đã kiểm hợp đồng và CSRF sang Identity. Google dùng callback `/api/auth/callback/google`. BFF kiểm chữ ký ID token bằng JOSE và chỉ tin email đã xác minh thuộc Gmail hoặc miền Google Workspace khớp claim `hd`.
- Identity tìm theo Google subject trước. Nếu chưa có subject, Identity có thể liên kết tài khoản đang hoạt động, đã xác minh cùng email và chưa gắn Google khác. Liên kết ghi subject và audit trong giao dịch cấp phiên. Tài khoản giữ ID, mật khẩu, dữ liệu và vai trò. Unique constraint bảo vệ subject khi callback chạy đồng thời.
- Cả hai luồng trả phiên `__Host-sg_session` của Identity. Logout và thu hồi phiên qua Identity. BFF dùng TLS và IP socket theo [ADR 0005](0005-web-auth-bff.md).
- Identity giới hạn đăng nhập Google theo email ở mức 10 lượt mỗi 15 phút. Khi vượt giới hạn, Web hiển thị thông báo riêng. Tài khoản bị vô hiệu hóa, email SmartGym chưa xác minh hoặc subject khác đã liên kết có kết quả từ chối tương ứng.

## Hệ quả và kiểm chứng

Mỗi môi trường phải đăng ký callback chính xác và cấp secret cho Web theo [runbook](../guides/OPERATIONS.md#web-auth-t10). Nghiệp vụ giữ ID và vai trò được kiểm bằng [Identity integration](../../backend/services/identity/test/identity.test.cjs). Luồng OIDC, cookie và xử lý rate limit được kiểm với [Google fixture](../../tests/integration/google-auth.test.mjs). Xem lại ADR khi đổi nhà cung cấp danh tính, nơi sở hữu phiên hoặc chính sách liên kết tài khoản.
