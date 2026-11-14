# ADR 0003 — Triển khai Identity độc lập

Status: ACCEPTED trong phạm vi backend local, theo quyền quyết định kỹ thuật đã được giao khi người dùng yêu cầu tiếp tục backend. Không đổi bảy ranh giới ở ADR 0001.

Identity dùng NestJS ESM và pg, database riêng, SQL migration có checksum. Chọn Node.js 24.22.1 đang chạy và API crypto.argon2 đã có trong runtime/types, thay vì thêm native addon hoặc dùng thuật toán khác với thiết kế. Hash PHC Argon2id v19, 19 MiB, 2 passes, p=1, salt 16 byte, tag 32 byte; giới hạn 4 tác vụ hash đồng thời mỗi process. Đo lại trên máy triển khai trước M6. Node rolling docs không xác lập exact patch; build và phép thử trên runtime local là bằng chứng riêng.

RSA >=2048 RS256 ký assertion aud=smartgym-api tối đa 5 phút; private key chỉ đọc từ secret file. JWKS có thể giữ public key cũ trong cửa sổ rotation. AES-256-GCM bảo vệ secret email, AAD gắn deliveryRef và purpose; khóa mã hóa và khóa HMAC limiter là hai secret độc lập. Không tự tạo khóa mặc định khi start.

TLS trực tiếp tại Identity, yêu cầu client certificate hợp lệ và allowlist SHA-256 fingerprint theo caller BFF/Notification/backend. Không tin header giả mTLS hay user/role. BFF gọi các route auth/profile qua mTLS, giữ nguyên Origin và X-SmartGym-CSRF; Identity cũng kiểm hai trường này. Set-Cookie từ Identity là chỉ dẫn để BFF chuyển đúng một cookie đã cho phép, không đưa opaque handle vào JSON. Đây là hợp đồng transport backend, chưa triển khai BFF tại T08.

Rate limiting chia sẻ qua PostgreSQL theo IP do BFF xác nhận và định danh HMAC, không lưu IP/email thô trong bucket. BFF phải thay X-SmartGym-Client-IP bằng IP trình duyệt đã xác định ở ingress; cấm chuyển header client nguyên trạng. Không tin X-Forwarded-For tại Identity. T10 kiểm hợp đồng này trước mở public.

Identity ghi email action và outbox trong cùng transaction; chưa publish RabbitMQ ở T08. T09 bổ sung relay/consumer/provider và kiểm gửi email sandbox. Token hành động ở fragment URL của trang xác minh/reset, chỉ tiêu thụ bằng POST; không tự đăng nhập sau verify/reset. Action cũ cùng purpose bị supersede khi resend. Reset tăng credential version và thu hồi mọi session, kể cả login đang chạy đồng thời qua khóa user. Vai trò hiện hành được đọc lại khi introspect, không cache ADMIN.

CLI cấp/revoke ADMIN là thao tác vận hành có quyền DB riêng, ghi audit và chặn hạ admin cuối; không có endpoint tự nâng quyền. Test dùng database/cert/khóa riêng sinh tạm, không seed tài khoản production. Không phát hành hoặc triển khai môi trường chung trong task này.

Nguồn kiểm ngày 2026-11-07: [Node crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html), [Node TLS](https://nodejs.org/docs/latest-v24.x/api/tls.html), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Xem [bảng phiên bản](../guides/TECHNOLOGY_VERSIONS.md), [API](../api/API_CONTRACTS.md), [bảo mật](../design/SECURITY.md).
