# ADR 0005 — BFF xác thực và địa chỉ client

Status ACCEPTED cho T10 local, theo yêu cầu tiếp tục thực hiện và quyền quyết định kỹ thuật đã giao. Không đổi topology hoặc ownership Identity.

Next.js 16.4.5 App Router dựng trang public/private và server-render profile. BFF auth dùng Node HTTPS custom server trong frontend/server.mjs, dispatch allowlist trước Next request handler. Lý do: Route Handler Web Request không cung cấp socket peer được xác thực, trong khi rate limiter Identity bắt buộc IP do BFF xác nhận. So với tin X-Forwarded-For hoặc thêm một proxy service, direct Node TLS cho phép lấy socket.remoteAddress, bỏ header giả và giữ cùng origin/cùng artifact Web. Không thay cơ chế mTLS của Identity. Catalog public có thể chạy khi auth tắt hoặc Identity lỗi.

Tradeoff: cần Node server, không hỗ trợ deployment serverless/Next standalone output ở cấu hình này; custom server mất một số tối ưu mặc định. Hosting/ingress mới phải đánh giá lại ADR và trust proxy, không tự bật trust X-Forwarded-For. Trong T10 không tin bất kỳ forwarded/client-IP header nào; ingress ngoài phải giữ Node là điểm TLS trực tiếp hoặc có thiết kế peer trust được duyệt trước rollout.

Browser auth chỉ gọi /api/v1/auth/* và /api/v1/me theo method/path cố định. BFF kiểm Host, HTTPS Origin chính xác, X-SmartGym-CSRF=1 trên mutations, JSON body/size/deadline, contract request/response và chỉ cookie __Host-sg_session. Không chuyển Authorization, user/role headers, client-IP header hoặc cookie khác. Internal Identity paths không được proxy công khai. Auth routes không tự retry, không follow redirects, no-store/no-referrer và không log body/token/cookie. Chỉ forward Set-Cookie đúng mẫu Secure/HttpOnly/SameSite=Lax/Path=/ và lifetime hợp đồng, trên login/reset/logout thành công.

BFF lấy profile và introspect session qua mTLS cho trang private; assertion/JWT chỉ giữ server, không serialize vào HTML/RSC hoặc browser response. Không cache profile/role. USER đến /admin nhận 403; ADMIN gate kiểm lại ở server, Catalog mutation còn phải tự kiểm JWT ở T11. /admin ở T10 chỉ là entry gate, không triển khai CMS sớm. Các widget Workout/Progress theo task riêng, không giả dữ liệu trong /app.

Form client giữ pending/success/error và field validation, chống submit song song, không lưu password hoặc token vào storage. Link verify/reset dùng fragment, xóa khỏi address bar ngay khi đọc và chỉ POST khi người dùng xác nhận. Không tự đăng nhập sau verify/reset. Return path chỉ cho /app, /app/ho-so và /admin, mặc định /app, không open redirect.

Cấu hình HTTPS Web và mTLS Identity độc lập; không có bypass verify TLS hay hạ Secure cookie. Test dùng CA/cert/DB/broker/SMTP riêng, Chromium trust tạm trong context test, không cài CA vào máy. Public-only vẫn dùng HTTP local khi BFF_AUTH_ENABLED không bật; auth API không nhận credentials ở chế độ đó.

Nguồn kiểm 2026-11-07: [Next custom server](https://nextjs.org/docs/app/guides/custom-server), [cookies](https://nextjs.org/docs/app/api-reference/functions/cookies), [Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route). Docs đang hiển thị 16.4.5 trùng manifest; build/runtime/browser mới là bằng chứng hành vi local.
