# ADR 0006 — Bản nháp và công bố bài tập

**ACCEPTED cho T11.** Catalog sở hữu bài tập, revision và nhật ký quản trị. Listener mTLS riêng trên cùng process và database phục vụ API admin. Catalog pin fingerprint BFF, lấy JWKS qua mTLS bằng certificate Catalog và kiểm chữ ký RS256, issuer, audience, hạn tối đa năm phút và role ADMIN. Khi JWKS gián đoạn, API admin trả 503 và listener public tiếp tục đọc Catalog. T12 nối BFF và màn hình vào listener này.

Migration 003 giữ dữ liệu Catalog hiện có. Bản nhập trước CMS đọc từ revision public làm điểm bắt đầu. Lưu nháp tạo revision bất biến. Publish tạo revision public mới với các trường công khai và đổi con trỏ cùng giao dịch. `draftVersion` mô tả revision nội dung đang sửa. ETag mô tả phiên bản tài nguyên quản trị và tăng khi đổi lifecycle. Slug đã công bố thuộc bài tập ban đầu. Gỡ công bố giữ slug và bản nháp để phục hồi ở T32. Cả slug hiện tại lẫn alias trả 404 sau khi gỡ.

Publish kiểm nhóm cơ và dụng cụ đang công bố. T11 hỗ trợ công bố hướng dẫn văn bản và giữ ID media/variant trong nháp. Publish từ chối media hoặc variant cho tới khi T31/T33 cung cấp bản ghi và quy trình duyệt. SourceRef chỉ ở bản quản trị. Luồng publish không lấy dữ liệu từ URL hoặc đường dẫn bên ngoài.

Khóa hàng bài tập trước khi đọc revision cho writer. Giao dịch publish/unpublish dùng chung advisory lock với bootstrap import để trình tự publication và cập nhật slug nhất quán. Cùng giao dịch ghi audit, publication và outbox. Idempotency của command POST lưu phản hồi gốc theo actor, operation, key và fingerprint trong 24 giờ. API public đọc trực tiếp revision đang công bố với `no-store`. Broker relay và snapshot RAG thuộc T36.

Tài liệu đối chiếu ngày 2026-11-07. [PostgreSQL 18 INSERT](https://www.postgresql.org/docs/18/sql-insert.html) · [JWT Best Current Practices](https://www.rfc-editor.org/rfc/rfc8725.html)

### Mở rộng T31

Migration 004 bổ sung owner và revision cho bốn loại hỗ trợ trong cùng database Catalog. Công bố bài pin revision taxonomy và variant. Công bố nội dung hỗ trợ cập nhật Catalog head. Archive chỉ được ghi khi giao dịch đang giữ khóa advisory 73002 và kiểm tra các revision bài đang public. Cùng khóa được dùng bởi publish bài, unpublish bài và bootstrap, vì vậy kiểm tra tham chiếu và thay đổi con trỏ public chạy theo một thứ tự commit. Media metadata pin object version từ upload READY. T33 quản lý bước tạo READY và phục vụ media. [PostgreSQL 18 explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html)

### Mở rộng T32

Khôi phục khóa owner và kiểm ETag, sau đó sao chép phiên bản nguồn thành revision nháp mới. Audit ghi phiên bản nguồn, phiên bản trước/sau và lý do khi người dùng chọn revision. Bài đang công bố tiếp tục dùng bản công khai cũ, bài đã archive trở về DRAFT. Giữ nguyên slug history và Catalog head. Khôi phục metadata media đã duyệt yêu cầu duyệt lại bản nháp. Lịch sử cũ trả tác giả trống khi nguồn không ghi tác giả. Màn hình lịch sử và khôi phục thuộc T35.
