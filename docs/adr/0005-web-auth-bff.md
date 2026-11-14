# ADR 0005 — BFF xác thực và địa chỉ client

Status ACCEPTED cho T10 local, theo yêu cầu tiếp tục thực hiện và quyền quyết định kỹ thuật đã giao. Không đổi topology hoặc ownership Identity.

Next.js 16.4.5 App Router dựng trang public/private và server-render profile. BFF auth dùng Node HTTPS custom server trong frontend/server.mjs, dispatch allowlist trước Next request handler. Lý do: Route Handler Web Request không cung cấp socket peer được xác thực, trong khi rate limiter Identity bắt buộc IP do BFF xác nhận. So với tin X-Forwarded-For hoặc thêm một proxy service, direct Node TLS cho phép lấy socket.remoteAddress, bỏ header giả và giữ cùng origin/cùng artifact Web. Không thay cơ chế mTLS của Identity. Catalog public có thể chạy khi auth tắt hoặc Identity lỗi.

Tradeoff: cần Node server, không hỗ trợ deployment serverless/Next standalone output ở cấu hình này; custom server mất một số tối ưu mặc định. Hosting/ingress mới phải đánh giá lại ADR và trust proxy, không tự bật trust X-Forwarded-For. Trong T10 không tin bất kỳ forwarded/client-IP header nào; ingress ngoài phải giữ Node là điểm TLS trực tiếp hoặc có thiết kế peer trust được duyệt trước rollout.

Browser dùng /api/v1/auth/* và /api/v1/me cho các thao tác Identity theo method/path cố định. BFF kiểm Host, HTTPS Origin chính xác, X-SmartGym-CSRF=1 trên mutations, JSON body/size/deadline, contract request/response và chỉ cookie __Host-sg_session. Không chuyển Authorization, user/role headers, client-IP header hoặc cookie khác. Internal Identity paths không được proxy công khai. Auth routes không tự retry, không follow redirects upstream Identity, no-store/no-referrer và không log body/token/cookie. Chỉ forward cookie phiên đúng mẫu Secure/HttpOnly/SameSite=Lax/Path=/ và lifetime hợp đồng.

Lựa chọn thư viện đăng nhập và chính sách liên kết Google được ghi ở [ADR 0025](0025-authjs-google-account-linking.md). Endpoint Google thuộc allowlist riêng của BFF dưới `/api/auth/`.

BFF lấy profile và introspect session qua mTLS cho trang riêng. Assertion/JWT chỉ giữ phía server. Web kiểm quyền trước khi vào `/admin`, còn Catalog tự kiểm JWT và vai trò khi phục vụ API quản trị theo [ADR 0006](0006-catalog-exercise-publication.md).

Form client giữ trạng thái và lỗi trong bộ nhớ. Link verify/reset dùng fragment, xóa khỏi thanh địa chỉ khi đọc và chỉ POST khi người dùng xác nhận. Đường dẫn quay lại được lọc bằng [allowlist của Web](../../frontend/app/auth/navigation.ts), mặc định `/app`.

Cấu hình HTTPS Web và mTLS Identity độc lập; không có bypass verify TLS hay hạ Secure cookie. Test dùng CA/cert/DB/broker/SMTP riêng, Chromium trust tạm trong context test, không cài CA vào máy. Public-only vẫn dùng HTTP local khi BFF_AUTH_ENABLED không bật; auth API không nhận credentials ở chế độ đó.

Nguồn kiểm 2026-11-07: [Next custom server](https://nextjs.org/docs/app/guides/custom-server), [cookies](https://nextjs.org/docs/app/api-reference/functions/cookies), [Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route). Docs đang hiển thị 16.4.5 trùng manifest; build/runtime/browser mới là bằng chứng hành vi local.
