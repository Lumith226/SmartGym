# Đặc tả sản phẩm SmartGym Web

**Trạng thái M0.** Phạm vi toàn hệ thống đã được yêu cầu. Các chính sách nghiệp vụ chi tiết ghi dưới dạng quyết định thiết kế hoặc giả định cần kiểm chứng. Các khả năng của bản web đều là thiết kế đến khi có bằng chứng triển khai.

[Mục lục](../../README.md) · [Luồng nghiệp vụ](USER_FLOWS.md) · [UI/UX](UI_UX.md) · [Frontend](FRONTEND_ARCHITECTURE.md) · [Kiến trúc](ARCHITECTURE.md) · [API](../api/API_CONTRACTS.md) · [Dữ liệu](DATABASE.md) · [Roadmap](../planning/IMPLEMENTATION_PLAN.md) · [Test](../planning/TEST_PLAN.md) · [Truy vết](../planning/TRACEABILITY.md)

## 1. Mục tiêu, người dùng và phạm vi

SmartGym giúp người tập tra cứu cách thực hiện bài bằng tiếng Việt, lập chương trình và lịch cá nhân, ghi kết quả, nhận phản hồi kỹ thuật từ camera/video và đặt câu hỏi có trích dẫn. Thư viện dạng bản đồ cơ thể là điểm vào công khai. Tài khoản liên kết các luồng cá nhân. Bảy ranh giới nghiệp vụ được thiết kế ở [Service Boundaries](SERVICE_BOUNDARIES.md).

| Nhóm | Nhu cầu và kết quả mong đợi |
|---|---|
| Khách | Tìm bài theo vùng cơ, thiết bị và tên, xem nội dung công bố, hỏi RAG trong giới hạn công khai. |
| USER đã xác minh | Lập kế hoạch và lịch, ghi buổi tập, xem thống kê, nhận nhắc lịch, dùng Pose và tùy chọn lưu kết quả. |
| ADMIN | Soạn, kiểm tra và xuất bản nội dung, quản lý nguồn và media, xem audit nội dung. Vai trò quản trị nội dung không mặc nhiên mở quyền đọc video hay nhật ký riêng. |
| Vận hành | Xác minh sức khỏe của từng service, theo dõi hàng đợi và tài nguyên, phục hồi và chứng minh các điều kiện bảo mật. |

Toàn bộ bảng yêu cầu ở mục 2 thuộc phạm vi Full System Planning. M1–M3 chỉ là các mốc xây dựng thư viện. M4 bao phủ tài khoản, quản trị, workout, tiến độ và thông báo. M5 bao phủ Pose, lưu kết quả và RAG. M6 nghiệm thu tích hợp. [Thứ tự và cổng nghiệm thu](../planning/IMPLEMENTATION_PLAN.md).

**Biên nghiệp vụ.** Chương trình và lịch là riêng theo tài khoản. Log có thể đến từ buổi theo lịch, dữ liệu nhập tay hoặc lần lưu AI có xác nhận. Trợ lý AI cung cấp góp ý kỹ thuật và câu trả lời có căn cứ. Các tích hợp y tế, chẩn đoán, thanh toán, mạng xã hội và quản trị phòng gym nằm ngoài phạm vi đã nêu. Media trình diễn và model chỉ được phân phối sau khi quyền sử dụng được xác minh. Mốc tích hợp vẫn thiết kế phương án thay thế khi tài sản cụ thể bị chặn.

## 2. Yêu cầu và tiêu chí chấp nhận

Mỗi hàng mô tả hành vi đích. [Ma trận truy vết](../planning/TRACEABILITY.md) nối các mã này với hợp đồng, task và ca kiểm thử.

| ID | Yêu cầu | Tiêu chí chấp nhận quan sát được | Luồng |
|---|---|---|---|
| IDN-001 | Đăng ký bằng email và xác minh tài khoản. | Email chuẩn hóa được kiểm tra duy nhất. Đăng ký và gửi lại công khai, không cần phiên và giữ phản hồi chống dò tài khoản. Token xác minh dùng một lần, hết hạn được xử lý và email xác minh qua Notification. | FLOW-02 |
| IDN-002 | Đăng nhập, đăng xuất, đọc/sửa hồ sơ của mình và quản lý phiên. | Thông tin đăng nhập đúng và email đã xác minh tạo cookie phiên BFF. Đúng thông tin nhưng chưa xác minh trả `403 EMAIL_UNVERIFIED` và không cấp cookie. Đăng xuất thu hồi phiên và xóa cache riêng. Tải lại trang đọc đúng hồ sơ và chỉ sửa được thuộc tính được phép. | FLOW-02, FLOW-03 |
| IDN-003 | Quên và đặt lại mật khẩu. | Yêu cầu quên mật khẩu trả phản hồi trung tính, email chứa liên kết hết hạn dùng một lần, đặt lại thành công thu hồi phiên cũ. Token dùng lại hoặc sai bị từ chối. | FLOW-02 |
| IDN-004 | Phân quyền và sở hữu tài nguyên. | USER truy cập được tài nguyên của mình. User thứ hai và token thiếu quyền bị từ chối. Tuyến admin và API ghi kiểm tra vai trò ở server. Cấp ADMIN qua quy trình vận hành được kiểm soát. | FLOW-02, FLOW-10 |
| CAT-001 | Duyệt nhóm cơ trên bản đồ SVG hoặc danh sách. | SVG và danh sách dùng cùng ID, đổi front/back giữ lựa chọn hợp lệ, click/chạm/bàn phím mở cùng kết quả. Dữ liệu nhóm cơ lấy từ Catalog. | FLOW-01 |
| CAT-002 | Tìm kiếm tiếng Việt, lọc và phân trang ổn định. | Kết hợp được bộ lọc công bố, URL khôi phục trạng thái, tìm có dấu/không dấu trả kết quả theo quy tắc thiết kế. Phân trang không lặp bài trong cùng tập dữ liệu ổn định. Rỗng và lỗi được phân biệt. | FLOW-01 |
| CAT-003 | Xem bài đã công bố, hướng dẫn, media hợp lệ và slug. | Nội dung chính có tiếng Việt và hiển thị nhóm cơ/dụng cụ. Slug cũ chuyển đến slug chuẩn nếu bài còn công bố. Bài đã gỡ không trả nội dung công khai. Media thiếu có hướng dẫn văn bản. | FLOW-01 |
| ADM-001 | Tạo và sửa bản nháp Catalog. | ADMIN xem trước bản nháp, sửa nguồn, nội dung, biến thể và metadata media. API kiểm tra dữ liệu và phiên bản. Cập nhật đồng thời không ghi đè im lặng. Bản nháp không có trong Catalog công khai/RAG. | FLOW-10 |
| ADM-002 | Xuất bản/gỡ công bố có kiểm tra quyền và audit. | Nội dung đủ trường và nguồn được công bố. Media thiếu quyền không được phát hành. Tài nguyên bị gỡ biến mất khỏi luồng công khai và trích dẫn. Audit ghi tác nhân, thời gian, thao tác và đối tượng. Trạng thái Catalog và cập nhật chỉ mục được phân biệt. | FLOW-10 |
| ADM-003 | CRUD năm loại Catalog. | Exercise, MuscleGroup, Equipment, ExerciseVariant và Media có danh sách, form, publish, archive và restore. Archive support còn được bài public tham chiếu trả 409. | FLOW-10 |
| ADM-004 | Revision, history, khôi phục và sửa đồng thời. | Nháp giữ riêng, restore revision tạo nháp mới, If-Match thiếu/cũ bị từ chối, audit không bị ghi đè. | FLOW-10 |
| ADM-005 | Upload, provenance và quyền media. | Upload private, file sai/quá giới hạn bị từ chối, chỉ Media READY và đã duyệt quyền mới công bố. Thay/gỡ có reference và cleanup policy. | FLOW-10 |
| ADM-006 | Nhập KB và xuất snapshot. | Validate/đối chiếu hash và ID, lỗi giữ nguyên public, apply nháp idempotent, export theo revision kèm checksum. | FLOW-10 |
| ADM-007 | Quyền CMS và audit. | Catalog tự xác minh ADMIN, user bị thu hồi không được ghi qua tab cũ, xem audit lọc theo actor/type/id. Identity sở hữu tài khoản. | FLOW-10 |
| WKT-001 | CRUD chương trình tập riêng, thứ tự bài và mục tiêu set. | Người dùng lưu được chương trình gồm bài Catalog hợp lệ và mục tiêu set, rep/thời lượng, nghỉ khi phù hợp. Mở lại giữ thứ tự. Bài bị gỡ giữ được tên lịch sử và không dùng làm lựa chọn mới. | FLOW-04 |
| WKT-002 | Lập lịch một lần hoặc hằng tuần theo múi giờ IANA. | Lịch ghi rõ múi giờ, thời điểm địa phương và phạm vi. Quy tắc hằng tuần sinh buổi trong cửa sổ 35 ngày. Người dùng thấy thời điểm kế tiếp và trường hợp giờ DST cần xử lý. | FLOW-05 |
| WKT-003 | Dời/hủy buổi và chống trùng giờ. | Người dùng dời hoặc hủy phạm vi được hỗ trợ. Hai yêu cầu đồng thời tạo buổi hoạt động chồng giờ cho cùng chủ sở hữu chỉ cho phép một kết quả hợp lệ. Buổi liền kề không xung đột. Buổi đổi/hủy phát thông tin để điều chỉnh nhắc lịch. | FLOW-05 |
| PRG-001 | Nhật ký thủ công hoặc từ buổi theo lịch. | Ghi được set và chỉ số thực tế, sửa/xóa log của mình. Một buổi có tối đa một log được liên kết theo quy tắc dữ liệu. Gửi lặp không tạo log trùng. Thay đổi lịch giữ lịch sử log. | FLOW-06 |
| PRG-002 | Dashboard và tổng hợp tiến độ. | Hiển thị buổi kế tiếp, log gần đây và chỉ số tiến độ có đơn vị theo khoảng lọc. Số liệu khớp dữ liệu kiểm thử. Dữ liệu rỗng, thiếu và lỗi từng widget có cách xử lý riêng. | FLOW-03, FLOW-06 |
| PRG-003 | Lưu kết quả Pose qua xác nhận của người dùng. | Chỉ nhập kết quả hoàn tất còn hợp lệ và thuộc người dùng. Một kết quả được nhập một lần, gồm trường chỉ số đã chọn và provenance. Gửi lại mở log đã có. Dữ liệu video/frame không thuộc log. | FLOW-06, FLOW-07 |
| POS-001 | Công bố bài hỗ trợ và xử lý video tải lên. | Chọn được đúng biến thể có capability, kiểm tra loại/dung lượng/thời lượng, nhận trạng thái job và kết quả. Tệp quá giới hạn, lỗi tải hoặc model không sẵn sàng có lỗi rõ. Idempotency giữ một job khi gửi lặp. | FLOW-07 |
| POS-002 | Tập trực tiếp qua camera trong trình duyệt. | Sau hành động rõ của người dùng và quyền camera hợp lệ, truyền frame theo giới hạn và nhận phản hồi. Từ chối quyền có phương án video. Đóng/dừng/mất kết nối dọn camera theo quy tắc phiên. | FLOW-07 |
| POS-003 | Trả số lần tập và góp ý kỹ thuật trong phạm vi đã đo. | Kết quả gồm bài/biến thể, số rep, chỉ số có thể xác minh, giới hạn và model/config version theo hợp đồng. Trường hợp thiếu khớp hoặc đầu vào ngoài khả năng báo không đủ căn cứ. Đạt các cổng chất lượng được chốt trước khi phát hành. | FLOW-07 |
| RAG-001 | Chatbot bàn giao có hội thoại và bốn task. | Knowledge có nguồn/thiếu căn cứ. Summary và practice dùng kết quả thuộc owner. Score dùng policy được phê duyệt hoặc nói thiếu quy tắc. Giữ references, notices, video state và phân biệt model lỗi. Không tự ghi lịch hoặc nhật ký. | FLOW-08 |
| RAG-002 | Tích hợp nguồn Catalog với KB bàn giao. | Feed Catalog giữ publication/version/visibility, nguồn sách/HTML dùng namespace và kb_version riêng. Đội RAG xác nhận ingest/reconcile trước nghiệm thu. Hủy công bố chặn trích dẫn nguồn Catalog theo hợp đồng. | FLOW-08, FLOW-10 |
| NTF-001 | Hộp thư, đánh dấu đã đọc và cài đặt kênh nhắc. | Hộp thư chỉ hiển thị mục của người dùng. Lưu cài đặt và tải lại nhất quán. Đánh dấu lặp không tạo mục khác. Lỗi từng phần có thao tác thử lại. | FLOW-09 |
| NTF-002 | Nhắc lịch qua app hoặc email theo tùy chọn. | Nhắc theo giờ và phiên bản buổi. Dời/hủy buổi thay hoặc hủy nhắc chưa giao. Sự kiện lặp hoặc cũ không tạo nhắc trùng. Đo trạng thái giao theo kênh. | FLOW-05, FLOW-09 |
| NTF-003 | Gửi email giao dịch để xác minh và đặt lại mật khẩu. | Hai email bảo mật chạy độc lập với tùy chọn nhắc lịch. Sự kiện không mang token thô. Trì hoãn/thất bại hiển thị phản hồi trung tính và có cách gửi lại được giới hạn. | FLOW-02, FLOW-09 |
| WEB-001 | Shell website, khả năng tiếp cận, responsive và SEO. | Điều hướng công khai/riêng/admin đúng quyền. Thao tác chính dùng được bằng bàn phím, focus thấy rõ, 320–1440 px không mất nội dung chính. Trang bài công bố có metadata và URL chuẩn, trang riêng không lập chỉ mục. | FLOW-01 đến FLOW-10 |
| SYS-001 | Ranh giới, triển khai độc lập và cô lập lỗi. | Mỗi backend có build, test, start và artifact riêng. Truy cập DB chéo bị từ chối. Catalog duyệt được khi Pose, RAG hoặc broker gián đoạn theo [kiến trúc](ARCHITECTURE.md). Có contract test và diễn tập nâng cấp/rollback một service. | FLOW-01, FLOW-07 đến FLOW-10 |
| SEC-001 | Bảo vệ dữ liệu, phiên, đầu vào và tài sản. | Tài nguyên riêng chống truy cập chéo tài khoản. Camera xin quyền và chỉ truyền dữ liệu cần thiết. Retention/xóa được kiểm chứng, log không chứa token hoặc video thô, media và model có provenance. | FLOW-02, FLOW-06 đến FLOW-10 |
| OPS-001 | Vận hành, giám sát, khôi phục và bằng chứng phát hành. | Có cấu hình lặp lại, health/readiness, correlation ID, metrics, cảnh báo, quy trình backup/restore và rollback. Chạy và ghi bằng chứng theo cổng M6. | FLOW-03, FLOW-07 đến FLOW-10 |

## 3. Chính sách thiết kế và giả định

| Chủ đề | Mặc định để thiết kế | Điều cần xác nhận và ảnh hưởng |
|---|---|---|
| Định danh | Email/mật khẩu, xác minh email trước khi cấp phiên, vai trò USER/ADMIN. Gửi lại email xác minh qua endpoint công khai có phản hồi trung tính. | Xác nhận nguồn cấp ADMIN và nhà cung cấp email trong M4. Chọn nhà cung cấp qua adapter. |
| Nội dung và tìm kiếm | Catalog là nguồn chuẩn cho bài công bố. Gõ tiếng Việt có hoặc không dấu, cho phép tên khác đã kiểm kê. Lọc nhóm cơ và dụng cụ theo hợp đồng, dùng ID ổn định và canonical slug. | Quyền phân phối từng asset, danh sách bài đủ điều kiện phát hành, độ phủ từ khóa và cách phân nhóm phải đối chiếu tài liệu nguồn. |
| Lịch | Một lần hoặc hằng tuần, IANA timezone, cửa sổ 35 ngày. Buổi chồng thời gian của cùng chủ không hợp lệ khi còn hoạt động. Lịch sử giữ sau khi đổi quy tắc. Giờ địa phương không tồn tại do DST chuyển tới instant hợp lệ đầu tiên, giờ lặp dùng instant sớm hơn. | Timezone mặc định lấy hồ sơ hoặc trình duyệt và luôn cho chỉnh khi tạo. Phạm vi sửa và độ dài quy tắc theo hợp đồng, cần kiểm thử với dữ liệu có DST. |
| Nhắc lịch | Nhắc trong app hoặc email theo cài đặt. Mặc định đề xuất nhắc trong app trước 60 phút. Email xác minh/reset là luồng giao dịch riêng. | Xác minh thời gian mặc định, độ trễ giao chấp nhận được, consent và provider. |
| Pose | Chế độ video và webcam đều được thiết kế. Chỉ bật biến thể qua kiểm tra capability và quyền model. Raw media có TTL, kết quả chỉ đi vào Progress sau xác nhận. | Ngưỡng beta đầu vào đề xuất 100 MiB/120 giây, webcam tối đa 10 fps, 640 × 480, 256 KiB mỗi frame. Giới hạn hiệu lực theo [API](../api/API_CONTRACTS.md) và [bảo mật](SECURITY.md). Chốt thiết bị, chất lượng và tải từ phép đo. |
| RAG | Hỏi công khai có rate limit, dùng dữ liệu công bố và không tự sửa trạng thái hệ thống. Hội thoại không lưu dài hạn trên Web theo thiết kế mặc định. | Chốt model/provider, phạm vi nội dung, số lượng bộ câu hỏi vàng, độ trễ và ngân sách sau khi kiểm kê quyền và thử trên môi trường được phép. |
| Admin | Quản trị nội dung và audit thao tác. Bộ lọc trạng thái và xem trước chỉ cho ADMIN. | Xác định ai duyệt nội dung, quy tắc sửa bản đã công bố và người có quyền nhập tài sản qua quy trình vận hành. |

## 4. Chất lượng và giới hạn bằng chứng

- **Khả năng tiếp cận.** Mục tiêu WCAG 2.2 AA cho các luồng chính, có bàn phím và đọc màn hình. Dùng cả kiểm tra tự động và thủ công, bao gồm dialog, form, bản đồ, biểu đồ và điều hướng. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- **Hiệu năng.** Mục tiêu beta đề xuất cho luồng công khai là p75 LCP ≤ 2,5 giây, INP ≤ 200 ms và CLS ≤ 0,10 trên dữ liệu/thông số thiết bị đã ghi. Phép đo backend, webcam, video và RAG phải có ngưỡng, fixture, thời gian quan sát và môi trường đã chốt trong [kế hoạch kiểm thử](../planning/TEST_PLAN.md). Đây là mục tiêu thiết kế, chưa phải kết quả.
- **Chất lượng AI.** Công bố độ phủ theo bài/biến thể và metric từ môi trường được ghi. Đo đếm rep trên video có nhãn rep. Góp ý kỹ thuật chỉ công bố độ chính xác khi bộ dữ liệu có nhãn lỗi phù hợp. Trả trạng thái không đủ căn cứ khi camera, dữ liệu hoặc truy xuất không đủ.
- **Bảo mật và vận hành.** Chặn truy cập chéo tài khoản, kiểm tra giới hạn, duy trì bản dữ liệu hợp lệ và lối đọc Catalog khi AI lỗi. Điều kiện giữ/xóa dữ liệu, backup, phục hồi, cảnh báo và quyền triển khai nằm ở [Security](SECURITY.md) và [Operations](../guides/OPERATIONS.md).

Phạm vi CMS gồm đúng năm loại trong Catalog và Admin Web sử dụng API thật. DRAFT → PUBLISHED → ARCHIVED, sửa bài public tạo nháp riêng, restore thành nháp. REVIEW và tách editor/publisher là đề xuất chờ nghiệp vụ. Dữ liệu UI tĩnh có thể đóng gói, dữ liệu nội dung động lấy từ API. Đội ngoài sở hữu Pose/RAG, SmartGym Web thực hiện tích hợp qua hợp đồng bàn giao.
