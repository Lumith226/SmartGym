# Master Prompt SmartGym Web

**Mục tiêu mặc định là Full System Planning & Design cho SmartGym Web theo kiến trúc microservices.** Lập bộ thiết kế đủ để agent phát triển tiếp, gồm GPT-6.1 Ultra theo yêu cầu bàn giao, có thể chọn task và xây đúng hợp đồng, schema và tiêu chí nghiệm thu. SmartGym là nền tảng tập luyện tiếng Việt với thư viện kiểu MuscleWiki, quản lý tập luyện cá nhân và tích hợp AI. Dùng tài sản có quyền sử dụng phù hợp.

## 1. Thư mục và quyền thao tác

Cấu trúc mã theo yêu cầu người dùng là `frontend/` cho Next.js/BFF và `backend/services/<service>/` cho backend. Workspace và lockfile ở root, infra/tests/docs có thư mục riêng. Tạo service khi có task thực tế và giữ quy trình build/test/start độc lập.

- `WRITE_ROOT = E:\do an\SmartGym_Web` là đích duy nhất để tạo hoặc sửa file. Xác minh đường dẫn và thư mục làm việc thực tế trước khi ghi. Nếu đích thiếu hoặc phân giải sang vị trí khác, báo đường dẫn đã kiểm tra và dừng thao tác ghi. Git root của thư mục cha hoặc của dự án cũ không thay thế đích này.
- `REFERENCE_ROOT = E:\do an\SmartGym` là nguồn chỉ đọc cho Catalog legacy và Pose. Pose hiện hành ở `smart_gym_web_v4/server/` và `smart_gym_test_rtmpose_v4/`. `RAG_REFERENCE_ROOT = E:\do an\smart-gym-ai\services\kb_rag` là nguồn RAG bàn giao, API `/v1/chatbot`. Giữ nguyên nguồn và trạng thái Git. RAG cũ `SmartGym/backend/rag` chỉ là lịch sử. Khi thiếu tài sản, ghi giới hạn và tiếp tục phần độc lập. [ADR 0008](docs/adr/0008-ai-provider-handoff.md)
- Đọc các `AGENTS.md` áp dụng, kiểm tra file và thay đổi có sẵn trong phạm vi. Đọc nội dung trước khi sửa, bảo toàn chỉnh sửa của người dùng và tái sử dụng tài liệu tương đương. Nếu đích chưa có Git, chụp danh sách file trước và sau. Nếu có Git tại đích, kiểm tra cả diff lẫn file mới chưa được theo dõi.
- Chỉ chạy tác vụ trong phạm vi phiên, sandbox và quyền được cấp. Push, phát hành, triển khai lên môi trường dùng chung, sử dụng thông tin xác thực bên ngoài, reset/xóa dữ liệu hoặc migration phá hủy cần ủy quyền riêng.

## 2. Chọn chế độ theo yêu cầu hiện tại

Yêu cầu đọc, đánh giá hoặc chỉnh prompt chỉ tác động đến nội dung prompt. Khi người dùng yêu cầu **thực thi** prompt, dùng chế độ họ chỉ định. Nếu không chỉ định, dùng `PHASE=PLANNING`.

| Chế độ | Phạm vi và điểm dừng |
|---|---|
| `PHASE=PLANNING` | Thực hiện mục 3–9 cho **toàn hệ thống**, kể cả khi đích chưa có Git. Chỉ tạo hoặc sửa `README.md`, `AGENTS.md`, master prompt khi được yêu cầu và tài liệu Markdown/YAML dưới `docs/` trong `WRITE_ROOT`. Chỉ dùng lệnh đọc và kiểm tra có tác dụng phụ đã biết, không phát sinh cache, file hoặc thay đổi trạng thái ngoài allowlist. Git init, scaffold, code, cài công cụ/dependency, migration, cấu hình CI/hạ tầng thực thi và triển khai nằm ngoài chế độ này. Ghi `NOT RUN` với lý do khi thiếu công cụ an toàn. Dừng sau review. |
| `PHASE=IMPLEMENTATION` | Cần mã task hoặc milestone được người dùng chỉ định. Áp dụng mục 10 và các tiêu chí nghiệm thu liên quan. Nếu tài liệu, quyết định hoặc task phụ thuộc chưa sẵn sàng, ghi blocker và làm phần độc lập đã được giao. Dừng tại tiêu chí nghiệm thu của phạm vi. |
| `PHASE=AUTO` | Cần mốc đích rõ ràng. Hoàn tất hoặc đối chiếu Full System Planning ở M0 trước khi viết mã. `THROUGH=M3` giới hạn Development ở thư viện, `THROUGH=M6` đến nghiệm thu toàn hệ thống. Dừng tại mốc được giao hoặc khi hết task đủ điều kiện. Nếu thiếu mốc đích, yêu cầu người dùng chỉ định trước khi viết mã. |

Giải quyết các lựa chọn kỹ thuật có thể đảo ngược trong phạm vi được giao và ghi lại căn cứ. Chỉ yêu cầu làm rõ khi thiếu thông tin bắt buộc, quyết định nghiệp vụ có thể làm đổi phạm vi hoặc cần thêm quyền. Ghi rõ task nào bị ảnh hưởng và tiếp tục phần còn thực hiện được.

## 3. Kiểm kê và phân loại bằng chứng

Bắt đầu bằng một bản kiểm kê ngắn trong `docs/reviews/REPOSITORY_AUDIT.md`. Phân biệt hiện trạng đích với tài sản từ nguồn cũ. Ghi đường dẫn và bằng chứng liên quan, kèm commit hoặc snapshot dữ liệu khi xác định được. Nếu kết luận dựa trên thay đổi chưa commit, ghi rõ phần đó.

| Nguồn trong `REFERENCE_ROOT` | Kiểm tra trước khi đưa vào thiết kế |
|---|---|
| `knowledge_base/exercise_catalog.json` và `knowledge_base/wiki/` | Đếm bài từ dữ liệu, đối chiếu ID ổn định, biến thể, tên Việt, nhóm cơ, dụng cụ, hướng dẫn và media. Danh mục được mô tả có 33 bài chính. Ghi số xác minh được và các trường thiếu hoặc mâu thuẫn. |
| `smart_gym_web_v4/server/`, `smart_gym_test_rtmpose_v4/` | Kiểm bốn model V4, scope video/window/rep, hash/schema và mapping với RAG. API multipart đồng bộ và live protocol cần adapter vòng đời bảo mật cho Web. |
| `RAG_REFERENCE_ROOT` | Kiểm `/v1/chatbot`, bốn task, full model_result, citations/references, auth và dữ liệu/runtime. Giữ pipeline JSON/vector/Neo4j đã bàn giao. |

Dùng các trạng thái sau nhất quán trong tài liệu:

- `CONFIRMED` cho yêu cầu người dùng đã xác nhận.
- `SOURCE_VERIFIED` cho điều đã kiểm tra qua mã, cấu hình hoặc dữ liệu.
- `RUNTIME_VERIFIED` cho hành vi đã chạy và quan sát được. Kèm lệnh hoặc phép thử, môi trường liên quan và kết quả.
- `DOCUMENTED` cho điều mới thấy trong tài liệu. `ASSUMPTION` cho giả định làm việc. `OPEN` cho câu hỏi còn lại. `BLOCKED` cho phần thiếu điều kiện.
- Quyết định kiến trúc dùng `PROPOSED`, `ACCEPTED` hoặc `SUPERSEDED` trong ADR. Chỉ dùng `ACCEPTED` khi có căn cứ quyết định và ghi căn cứ đó.

Nếu tài liệu, mã và dữ liệu mâu thuẫn, nêu rõ mỗi nguồn cho thấy gì và ảnh hưởng đến thiết kế. Tách lệnh chạy của dự án cũ khỏi hướng dẫn chạy web mới.

Trong audit, ghi nguồn, commit/snapshot và hash khi có, quyền sử dụng media và weights, dependency, adapter, thay đổi và test sau tích hợp. Chỉ đưa tài sản vào đích trong task Development được giao. Loại secrets, dữ liệu nhạy cảm và phụ thuộc đường dẫn máy cá nhân. Script từ nguồn cũ chỉ chạy trong phạm vi Development nếu đã xác minh tác dụng phụ và quyền cho phép. Giữ Knowledge Base, Pose Python/ONNX và pipeline RAG phù hợp qua adapter, ghi ADR nếu phải thay thế.

## 4. Product Planning → System Architecture → Technical Design

**Định hướng đã xác nhận.** Thư viện bài tập kiểu MuscleWiki là nền tảng sản phẩm. Kiến trúc đích là microservices. Việc chỉ triển khai Web và Catalog ở mốc đầu là một lát cắt phát triển của hệ thống.

**Phạm vi hệ thống đã xác nhận.** Thiết kế đầy đủ thư viện, Interactive Muscle Map, tìm kiếm/lọc/hướng dẫn, tài khoản/xác thực/phân quyền, chương trình và lịch tập, nhật ký và tiến độ, AI Pose Analysis/đếm rep/góp ý, Chatbot RAG, thông báo/nhắc lịch, Admin Dashboard/quản trị nội dung, cùng frontend, backend, API, database, security, testing và infrastructure. Milestone chỉ sắp thứ tự xây. Chức năng chưa có mã vẫn thuộc thiết kế, roadmap, task và test. Ghi giả định có căn cứ cho quyết định nghiệp vụ còn mở và tiếp tục phần an toàn.

Trong PRD, chốt hoặc đánh dấu mở các điểm ảnh hưởng thiết kế gồm thiết bị đích, hành vi tìm kiếm tiếng Việt có dấu/không dấu, kết hợp bộ lọc, tiêu chí phát hành media, phiên AI ẩn danh hay có tài khoản, webcam trực tiếp hay video tải lên hay cả hai, lưu lịch sử hay chỉ giữ kết quả theo phiên, môi trường triển khai và tải dự kiến. Nếu cần giả định để tiếp tục, ghi giá trị, căn cứ, cách xác minh và mốc phải quyết định.

| Thứ tự | File | Nội dung bắt buộc |
|---|---|---|
| 1 | `docs/design/PRD.md` | Mục tiêu, người dùng, phạm vi theo mốc, yêu cầu chức năng/phi chức năng, tiêu chí chấp nhận quan sát được. Dùng ID ổn định như `CAT-001`, `MAP-001`. Ghi câu hỏi còn mở và yêu cầu bị ảnh hưởng. |
| 2 | `docs/design/USER_FLOWS.md` | Luồng Mermaid cho các nghiệp vụ công khai, xác thực, lịch tập, tiến độ, Pose, RAG, thông báo và quản trị. Mỗi luồng có nhánh lỗi và phục hồi. |
| 2a | `docs/design/UI_UX.md` và `docs/design/FRONTEND_ARCHITECTURE.md` | Thiết kế Public Website, Authentication, User Dashboard, Workout Planner, Progress, AI Training, RAG, Notifications và Admin. UI/UX sở hữu sitemap, màn hình, design system, responsive, SVG Muscle Map, touch/keyboard và trạng thái. Kiến trúc frontend sở hữu routes, page/component boundaries, API, fetch/cache/state, canonical/slug, SEO và tối ưu media. Liên kết requirement và test. |
| 3 | `docs/design/ARCHITECTURE.md` và `docs/design/SERVICE_BOUNDARIES.md` | Mermaid cho thành phần, triển khai và sequence. Ghi cây monorepo mục tiêu, ranh giới phụ thuộc, runtime/dependencies, cấu hình, health/readiness, build/test, artifact/versioning và release từng service. Ghi trách nhiệm, yêu cầu, ownership, phụ thuộc, bảo mật, lỗi, scaling và test cho đủ bảy ranh giới. Chỉ dùng chung hợp đồng và tiện ích kỹ thuật có mục đích. Thư viện vẫn truy cập được khi Pose hoặc RAG lỗi. |
| 4 | `docs/adr/0001-service-boundaries.md` | Ghi bối cảnh, lựa chọn, hệ quả, trạng thái và điều kiện xem xét lại. So sánh cách phân ranh giới và triển khai độc lập trong kiến trúc microservices, theo hiện trạng mã, runtime AI, độ trễ, vận hành và cô lập lỗi. Chỉ đưa gateway riêng hoặc broker vào khi có nhu cầu cụ thể. |
| 5 | `docs/design/DATABASE.md` | ERD Mermaid và schema đủ bảy service. Ghi bảng, trường, khóa, ràng buộc, chỉ mục, transaction, vòng đời, migration và source of truth. Bảo toàn ID bài, nhập snapshot và tái tạo chỉ mục RAG. Không join hoặc truy cập kho trực tiếp qua ranh giới. |
| 6 | `docs/api/API_CONTRACTS.md`, `docs/api/openapi.yaml` và `docs/api/events.yaml` | Hợp đồng HTTP và event cho toàn hệ thống. Ghi version, operationId, chủ sở hữu, quyền gọi, tham số, schema, ví dụ, lỗi, auth, idempotency và tương thích. Đặc tả live WebSocket, xác định broker/publisher/consumer, quyền, ordering, replay và lỗi. Phân biệt route legacy và v1. |

Với media, ghi nguồn, trạng thái quyền sử dụng và hành vi khi thiếu tài sản hợp lệ. Video dùng benchmark hoặc nằm trong repo chỉ được đưa vào kế hoạch công bố khi có căn cứ về quyền sử dụng.

## 5. Ranh giới microservices và hợp đồng

Dùng bảng sau làm phương án khởi điểm cho ADR. Xác minh khả năng tái sử dụng trước khi chốt runtime, công nghệ lưu trữ và giao thức. Có thể dùng monorepo để quản lý mã. Mỗi service có quy trình build, kiểm thử, cấu hình, phiên bản artifact và khả năng triển khai độc lập.

| Thành phần | Trách nhiệm và dữ liệu sở hữu | Hợp đồng và phụ thuộc |
|---|---|---|
| **Web / BFF nếu cần** | Muscle Map, tìm kiếm, chi tiết, UI phiên tập và chatbot. Sở hữu trạng thái trình bày và phiên web nếu có. | Gọi API đã công bố. Có thể làm điểm vào cùng origin cho trình duyệt. Xử lý điều hướng, giới hạn thời gian và trạng thái lỗi riêng cho từng tính năng. |
| **Identity Service** | Tài khoản, thông tin xác thực, profile, vai trò, session và token xác minh/reset. | Cung cấp đăng ký, xác minh, đăng nhập/đăng xuất, reset, introspection và khóa xác minh. Notification chuyển email qua tham chiếu opaque có quyền. |
| **Catalog Service** | Bài tập, ID/slug, nhóm cơ, dụng cụ, biến thể, hướng dẫn, trạng thái xuất bản, nguồn và metadata media. Sở hữu quy trình nhập dữ liệu từ Knowledge Base và phiên bản nội dung xuất. | Cung cấp API nhóm cơ, danh sách/tìm kiếm/lọc và chi tiết. Cung cấp hợp đồng xuất dữ liệu hoặc feed phiên bản hóa cho RAG. Luồng đọc Catalog độc lập với Pose và RAG. |
| **Workout Service** | Chương trình, danh sách bài và lịch lặp/một lần, lần tập theo lịch và phiên bản thay đổi. | Kiểm tra ID bài qua Catalog. Kiểm tra chồng lịch trong giao dịch. Cung cấp occurrence theo quyền và event cho Notification. |
| **Progress Service** | Nhật ký, hiệp, lần tập, chỉ số và nguồn gốc kết quả nhập. | Đọc occurrence/Pose qua hợp đồng nội bộ. Người dùng chủ động nhập kết quả Pose. Khóa duy nhất cho mỗi occurrence và Pose job trong phạm vi đã chốt. |
| **Pose Analysis Service** | Khả năng AI theo ID bài/biến thể, phiên hoặc job, trạng thái phân tích, kết quả rep, phiên bản model/cấu hình và vòng đời dữ liệu tạm. | Giữ runtime Python/ONNX khi phù hợp. Công bố capability và hợp đồng tạo phiên/job, lấy trạng thái/kết quả, hủy nếu hỗ trợ. Nếu xử lý video hoặc webcam, thiết kế input, giới hạn, quyền truy cập và backpressure cho từng loại. |
| **RAG Service** | Pipeline KB bàn giao, corpus sách/HTML, JSON snapshot/vector, Neo4j và Ollama. Catalog sở hữu riêng nội dung Web. | Tích hợp `/v1/chatbot`, giữ task/session/status/references và version KB. Feed Catalog cần T26/T36 chốt riêng, không mặc định provider đã nhận event. |
| **Notification Service** | Inbox, preferences, lịch gửi nhắc, lần giao và trạng thái gửi. | Tiêu thụ event Identity/Workout có version. Hủy nhắc lỗi thời, retry có giới hạn và kiểm tra dedup. Xác minh/reset qua email giao dịch. |

Admin Dashboard dùng Catalog API có quyền ADMIN và audit. Các module có thể tách/gộp khi ADR chứng minh được trách nhiệm, data ownership và cách triển khai.

- Với mỗi kho lưu trữ, ghi service sở hữu schema, migration, quyền đọc/ghi, backup/restore và thời hạn lưu. Nếu chia sẻ hạ tầng database, cô lập theo database hoặc schema và thông tin xác thực riêng. Service khác lấy dữ liệu qua API, event hoặc snapshot có phiên bản.
- Xác định ID bài tập làm khóa tham chiếu giữa Catalog, Pose và RAG. Chốt ý nghĩa ID/slug, quy tắc đổi slug, xử lý bài bị gỡ, phiên bản nội dung và cách RAG nhận biết dữ liệu cũ. Tránh join bảng hoặc cập nhật chéo service. Chọn chiến lược xử lý tham chiếu đã cũ và fallback khi thiếu metadata.
- Đối với mỗi hợp đồng, ghi consumer, cách xác thực, phạm vi quyền, deadline, giới hạn request, phân trang và lỗi có thể retry. Thống nhất schema lỗi và mã lỗi nghiệp vụ. Quy định tương thích ngược, thay đổi phá vỡ, cách nâng phiên bản và kiểm thử consumer/provider trước khi đổi.
- Đề xuất REST cho truy vấn và thao tác đơn giản, job bất đồng bộ cho video xử lý lâu. Tách webcam trực tiếp thành ADR về giao thức, độ trễ, quyền riêng tư và giới hạn tài nguyên. Chọn stack phù hợp môi trường thật. Next.js/TypeScript, NestJS, PostgreSQL và Compose là ứng viên cho web/Catalog và môi trường cục bộ. Ghi lại lựa chọn và giữ các runtime Python đang có khi kiểm chứng phù hợp.
- Sơ đồ Mermaid tối thiểu gồm topology triển khai, ERD theo quyền sở hữu, luồng tra cứu, sequence tạo job và retry, cùng luồng cập nhật chỉ mục RAG. Ghi rõ giao tiếp đồng bộ, bất đồng bộ, đường lỗi và trạng thái người dùng nhìn thấy.

### Điểm khởi đầu cho thiết kế hợp đồng

Đây là hợp đồng đề xuất để cụ thể hóa trong OpenAPI. Chỉ đưa endpoint vào mốc được duyệt và ghi lại mọi thay đổi có ảnh hưởng đến consumer.

| Nhóm | Hành vi cần đặc tả |
|---|---|
| **Catalog public** | `GET /api/v1/muscle-groups`, `GET /api/v1/exercises` với tìm kiếm, nhóm cơ, dụng cụ và phân trang, `GET /api/v1/exercises/{slug}` cho chi tiết. Chốt cách chuẩn hóa từ khóa, kết hợp bộ lọc, sort ổn định, slug cũ, bài đã gỡ và kết quả rỗng. Trả ID ổn định để chuyển sang luồng AI. |
| **Pose** | Công bố capability theo bài/biến thể. Nếu video được duyệt, đặc tả `POST /api/v1/pose/jobs`, `GET /api/v1/pose/jobs/{jobId}` và thao tác hủy nếu có. Chốt trình tự upload và tạo job, phản hồi nhận xử lý, trạng thái cuối, cách lấy kết quả và quyền theo job. Webcam dùng hợp đồng phiên và luồng riêng nếu được duyệt. |
| **RAG** | Dùng `/v1/chatbot` bàn giao làm hợp đồng upstream. Chốt contract Web đủ knowledge/score/summary/practice, result ID theo owner, references và trạng thái. Chấm điểm cần policy có version. Giữ full raw V4 phía server và namespace/version KB ngoài Catalog. |
| **Lỗi và vận hành** | Phân biệt lỗi dữ liệu vào, thiếu quyền, không tìm thấy, xung đột, quá tải và phụ thuộc không khả dụng. Mỗi lỗi có status, mã máy đọc được, thông báo phù hợp và correlation ID nếu có. Với thao tác bất đồng bộ, trả vị trí tra trạng thái hoặc hướng retry theo hợp đồng. Health/readiness chỉ tiết lộ thông tin cần thiết. |

Trong thiết kế import Catalog, ghi định dạng snapshot, phiên bản và cách kiểm tra trước khi công bố. Cập nhật lại cùng phiên bản phải cho cùng kết quả. Bản nhập lỗi giữ revision phục vụ gần nhất. Mô tả cách phát hiện ID trùng, thay đổi slug, bài bị gỡ, media thiếu quyền và bản ghi không hợp lệ. Truy vết được mỗi bản ghi đã công bố về nguồn.

Đặc tả signup/verify/session/reset, vai trò/ownership, admin draft/publish/unpublish, chương trình/lịch, nhật ký/summary/import và notification/preferences trong OpenAPI. Mỗi luồng liên service phải có transaction owner, cách đối chiếu trạng thái và test. Cụ thể hóa luật múi giờ/DST, chặn lịch chồng khi đồng thời, uniqueness của log/nhập Pose, nhắc lịch lỗi thời và cách xử lý email retry.

## 6. Tính nhất quán, lỗi phân tán và tích hợp AI

### Phiên tập và job phân tích

1. Vẽ state machine và bảng chuyển trạng thái. Với job video, có thể dùng `QUEUED → RUNNING → SUCCEEDED | FAILED | CANCELED`. Chốt điều kiện chuyển, tác nhân được phép, trạng thái cuối, hủy khi worker đang chạy và phục hồi khi worker chết. Chốt TTL dọn dữ liệu riêng với vòng đời trạng thái. Webcam trực tiếp có vòng đời kết nối và chính sách mất kết nối riêng.
2. Với thao tác tạo job hoặc phiên có thể retry, yêu cầu idempotency ở service sở hữu. Thiết kế khóa duy nhất theo principal hoặc phiên khách, thao tác và idempotency key. Gắn fingerprint của payload. Ghi bản ghi idempotency cùng trạng thái tạo job trong một giao dịch hoặc cơ chế nguyên tử tương đương. Cùng khóa/cùng payload trả cùng ID và ngữ nghĩa replay đã công bố. Cùng khóa/khác payload trả lỗi xung đột đã quy định. Chốt cửa sổ giữ khóa, hành vi khi hết hạn và khi request đầu vẫn đang xử lý.
3. Xử lý nhiều worker bằng cơ chế claim nguyên tử hoặc lease có bảo vệ khi ghi kết quả. Ghi rõ cách loại bỏ kết quả từ worker đã mất quyền, cách chống ghi trùng rep và cách chống hai yêu cầu kết thúc/hủy ghi đè lẫn nhau. Dùng ràng buộc dữ liệu và kiểm thử đồng thời để chứng minh mỗi thao tác logic chỉ tạo số bản ghi cần thiết.
4. Đặt timeout theo chuỗi gọi, retry hữu hạn với backoff và jitter cho thao tác an toàn. Khi client timeout sau khi server đã nhận lệnh, tra trạng thái hoặc replay cùng khóa. Giới hạn hàng đợi, số phiên đồng thời và số frame chờ. Mô tả cách từ chối hoặc giảm tải và thông báo UI khi quá tải, mất camera, upload gián đoạn hoặc model lỗi.
5. Nếu quyết định dùng event, ghi publisher/consumer, schema có phiên bản, ID sự kiện, thứ tự cần đảm bảo, cơ chế replay, dedup và cách xử lý message lỗi. Khi một thay đổi cần vừa commit DB vừa phát event, thiết kế transactional outbox hoặc cơ chế nhất quán tương đương. Chỉ thiết kế bù trừ khi một luồng thực sự có ghi ở nhiều service. Ghi trách nhiệm dọn file tạm và cách khôi phục sau lỗi giữa các bước.

### Nghiệm thu Pose Analysis

- Lập danh sách bài/biến thể được hỗ trợ dựa trên model và logic thực tế. Gắn bản phát hành với phiên bản model, cấu hình tiền/hậu xử lý và thiết bị chạy. Ghi hạn chế theo góc quay, che khuất hoặc thiếu khớp nếu có bằng chứng.
- Tách lấy frame trình duyệt khỏi logic camera desktop hiện có. Chốt kích thước và tốc độ frame hoặc quy cách video, giới hạn dung lượng/thời lượng, cơ chế kết thúc phiên, cách lấy kết quả từng rep và hành vi khi tín hiệu yếu.
- Đặt bộ mẫu nghiệm thu và ngưỡng có căn cứ cho sai số đếm rep, chất lượng phản hồi form khi có nhãn phù hợp, độ trễ p95 và tải đồng thời. Đo trên môi trường đích đã nêu. Ghi chỉ số nào thiếu dữ liệu để đánh giá. Báo benchmark offline và kết quả đầu cuối riêng. Mô tả góp ý như hướng dẫn kỹ thuật tập luyện và công khai giới hạn đánh giá.

### Nghiệm thu RAG

- Chốt dữ liệu nhập, chunking, mô hình embedding/generation, reranking nếu có, provenance và version của chỉ mục. Lập chỉ mục lại theo revision có thể tái tạo. Khi build chỉ mục mới lỗi, giữ revision hợp lệ gần nhất. Chốt hành vi khi bài được sửa/gỡ, khi trích dẫn cũ và khi không có nguồn phù hợp.
- Dùng bộ câu hỏi tiếng Việt tách khỏi dữ liệu dùng tinh chỉnh. Bao phủ câu hỏi có đáp án trực tiếp, tổng hợp, mơ hồ, ngoài phạm vi, nguồn bị gỡ và nội dung truy xuất chứa chỉ dẫn đánh lừa. Đo khả năng tìm đúng nguồn, trích dẫn đúng, trả lời bám bằng chứng, từ chối phù hợp và latency. Ghi cách xem xét ca lỗi cùng ngưỡng có căn cứ.
- Xem câu hỏi và nội dung truy xuất là dữ liệu không tin cậy. Thiết kế quyền truy cập và lọc nguồn để câu trả lời chỉ trích dẫn nội dung được phép. Khi model hoặc index không khả dụng, trả lỗi hoặc trạng thái thiếu căn cứ theo hợp đồng. Web vẫn tra cứu bài tập bình thường.

## 7. Implementation Planning → Development Guidelines

| File | Nội dung bắt buộc |
|---|---|
| `docs/planning/IMPLEMENTATION_PLAN.md` | Mỗi mốc có phạm vi, điều kiện vào, phụ thuộc, deliverable, rủi ro, phép xác minh và điều kiện ra đo được. Dùng bảng mốc phía dưới làm thứ tự đề xuất. Ghi lý do nếu đổi thứ tự. |
| `docs/planning/TASKS.md` | Mỗi task có ID, mốc, ưu tiên, phụ thuộc theo ID, ID yêu cầu hoặc ADR, tiêu chí hoàn thành và bước xác minh. Dùng `TODO`, `READY`, `IN_PROGRESS`, `BLOCKED`, `DONE`. `BLOCKED` phải có lý do và điều kiện mở lại. |
| `docs/planning/TEST_PLAN.md` và `docs/planning/TRACEABILITY.md` | Mỗi ca có ID, đầu vào, bước kiểm tra, kết quả mong đợi và yêu cầu liên quan. Mỗi requirement có service/component, API/data, task và test. Bao phủ toàn hệ thống, quyền, race, retry và phục hồi. Ô không áp dụng ghi `N/A` kèm lý do. |
| `README.md` | Điểm vào của dự án web, hiện trạng, mục lục tài liệu và lệnh đã xác minh nếu có. |
| `AGENTS.md` | Quy định thứ tự đọc tài liệu, cách nhận task, quyền sở hữu dữ liệu, quy tắc sửa mã, cách chạy và báo kết quả kiểm tra, xử lý lỗi và cập nhật task/ADR/hợp đồng. Phân biệt lệnh hiện có và lệnh dự kiến. |
| `docs/design/SECURITY.md`, `docs/guides/OPERATIONS.md` và `docs/design/AI_INTEGRATION.md` | Threat model, auth, privacy và retention. Thiết kế môi trường, artifact, cấu hình, health check, log, rollback và phục hồi. Đặc tả tái sử dụng Pose/RAG, contract, dữ liệu/model provenance, giới hạn, chất lượng và lỗi. |

Mỗi chủ đề có một tài liệu chuẩn. Dẫn liên kết chéo thay vì lặp nội dung. Có thể cập nhật file tương đương trong phạm vi được phép và cập nhật mục lục cho khớp.

| Mốc | Điều kiện ra tối thiểu |
|---|---|
| **M0 — Full System Planning** | Phạm vi đầy đủ, product spec, kiến trúc bảy ranh giới, backend/schema/API/events, toàn bộ frontend, Pose/RAG, security/infra, roadmap, tasks, tests và review. Quyết định mở có giả định và mốc bị ảnh hưởng. |
| **M1 — Lát cắt thư viện** | Web và Catalog chạy qua API thật. Một luồng chọn nhóm cơ, lọc và mở bài chạy với bản ghi SmartGym đã kiểm kê. Có lệnh chạy, import và test lặp lại được. |
| **M2 — Hoàn thiện thư viện** | Danh mục đủ phạm vi đã duyệt, tìm kiếm/lọc nhất quán, media có nguồn hợp lệ hoặc fallback, trải nghiệm desktop/mobile và bàn phím đã được kiểm tra. |
| **M3 — Nghiệm thu MVP** | E2E chính, contract và kiểm tra bảo mật áp dụng đạt tiêu chí. Thư viện chạy độc lập với các thành phần AI. Có hướng dẫn vận hành cho phạm vi MVP. |
| **M4 — Tài khoản và quản lý tập luyện** | Identity, email, admin, chương trình/lịch, progress, dashboard, inbox và nhắc lịch chạy qua hợp đồng thật. Chứng minh quyền, lịch đồng thời, log trùng và reminder lỗi thời. |
| **M5 — Pose và RAG** | Pose upload/live, rep/form, nhập kết quả sang Progress và RAG có trích dẫn. Chứng minh idempotency, giới hạn camera, chất lượng và lỗi AI. |
| **M6 — Nghiệm thu tích hợp đầy đủ** | Web và mọi backend thuộc phạm vi có artifact, cấu hình, build/test/start, version và triển khai độc lập. Chứng minh hợp đồng, quyền kho dữ liệu, contract/integration tests, cô lập lỗi Catalog/Pose/RAG, rollback/restore và vận hành. M1–M3 chỉ chứng minh lát cắt thư viện. |

## 8. Kiểm thử, bảo mật và sẵn sàng vận hành

Trong Planning, mô tả các biện pháp, phép thử và ngưỡng tương ứng. Trong Implementation hoặc Auto, thực thi những phép thử thuộc mốc được giao và ghi bằng chứng.

### Các lớp kiểm thử

- **Mỗi service.** Unit cho luật nghiệp vụ, integration với kho lưu trữ thật trong môi trường test, contract cho request/response và migration trên dữ liệu phù hợp. Có fixture ổn định và lệnh chạy tái lập.
- **Luồng người dùng.** E2E cho bản đồ → danh sách → chi tiết, lọc kết hợp, sử dụng bàn phím, mobile, media thiếu và bài không tồn tại. E2E tích hợp Pose/RAG dùng service thật, dữ liệu đã kiểm kê và model hoặc môi trường đánh giá đã chốt.
- **Phân tán.** Gửi lặp và gửi đồng thời cùng khóa, cùng khóa khác payload, mất phản hồi sau commit, worker restart, trạng thái sai thứ tự và tải vượt ngưỡng. Kiểm tra kết quả nghiệp vụ, số bản ghi, trạng thái cuối và khả năng phục hồi. Thử tắt riêng Pose, RAG hoặc phụ thuộc AI trong khi người dùng duyệt Catalog.
- **Bảo mật và riêng tư.** Thử truy cập job/kết quả của phiên khác, yêu cầu hết hạn, rate limit, payload sai, video quá lớn, loại file giả, nội dung độc hại, hết hạn/xóa dữ liệu và dữ liệu nhạy cảm trong log. Chỉ áp dụng ca theo tính năng đã triển khai.
- **Chất lượng và hiệu năng.** Ghi môi trường, dữ liệu, phương pháp đo và ngưỡng trước khi nghiệm thu. Báo riêng p95 latency, throughput, tỷ lệ lỗi, tài nguyên và độ chính xác AI theo phạm vi đã chốt. Kết quả chưa đo để `NOT RUN`.

### Các điều kiện vận hành

- **Biên tin cậy và truy cập.** Vẽ biên trình duyệt, ingress, service, storage và model provider. Chốt xác thực, phân quyền, bảo vệ phiên AI ẩn danh hoặc có tài khoản, chính sách TLS/CORS/CSRF theo cách triển khai, xác thực giữa service khi cần và bí mật theo môi trường. Kiểm soát quyền dùng URL tải lên/tải xuống và tránh log token, video, frame, dữ liệu khớp gắn với người dùng hoặc câu hỏi cá nhân.
- **Media và webcam.** Hỏi quyền camera ở thời điểm sử dụng. Ghi nơi xử lý dữ liệu, dữ liệu nào rời thiết bị, giới hạn đầu vào, nơi lưu tạm, xóa khi hết hạn hoặc hủy, quyền xem kết quả và hành vi khi người dùng từ chối. Chốt phụ thuộc model bên ngoài và luồng dữ liệu tương ứng trước khi bật.
- **Tái lập môi trường.** Có lệnh dựng hệ thống cục bộ bằng Compose hoặc công cụ đã chọn, cấu hình mẫu an toàn, phiên bản runtime/model, migration, seed/import và kiểm tra readiness. Phân biệt liveness với readiness. Khi dịch vụ AI lỗi, readiness của đường tra cứu đánh giá theo phụ thuộc của chính đường đó.
- **Quan sát hệ thống.** Dùng correlation ID xuyên các hop cần thiết. Log có cấu trúc và được lược bỏ dữ liệu nhạy cảm. Thu metrics cho request, lỗi, p95 latency, độ dài hàng đợi, saturation, lỗi model và độ cũ của chỉ mục. Đặt ngưỡng cảnh báo có căn cứ và runbook cho lỗi AI, queue backlog, Catalog hoặc index không khả dụng.
- **Phát hành và phục hồi.** CI kiểm tra build/test/contract theo service, cấu hình và bí mật. Ghi thứ tự release, tương thích trong thời gian nâng phiên bản, migration, rollback, backup/restore và cách kiểm chứng. Tại M6, chạy smoke test, kiểm tra cô lập lỗi và diễn tập rollback/restore phù hợp môi trường đích. Triển khai lên môi trường dùng chung theo quyền ở mục 1.

## 9. Điều kiện kết thúc Planning

1. Kiểm tra chéo PRD, UX/frontend, Mermaid, ADR, ownership, database, HTTP/events, bảo mật, operations, mốc, task và test. Kiểm tra ID thiếu/trùng, liên kết nội bộ, phụ thuộc thiếu hoặc vòng lặp. Mọi yêu cầu toàn hệ thống có tiêu chí chấp nhận, service/component, API/data, task và ca kiểm thử.
2. Kiểm tra riêng cú pháp YAML và schema/tham chiếu OpenAPI. Kiểm tra cú pháp hoặc render Mermaid khi có công cụ. Báo từng mục `PASS`, `FAIL` hoặc `NOT RUN`, kèm bằng chứng hoặc lý do. Chỉ dùng công cụ đã có trong chế độ Planning.
3. Kiểm tra các file mới và đã sửa nằm đúng phạm vi. Sửa mâu thuẫn có thể giải quyết. Ghi rõ lỗi còn lại, mục chưa xác minh, quyết định chờ người dùng và mốc/task bị ảnh hưởng. Phân biệt tài liệu sẵn sàng để giao với phần còn blocker.
4. Ghi `docs/reviews/DESIGN_REVIEW.md` với file đã tạo/sửa, kết quả kiểm tra, quyết định/giả định, thiếu sót, blocker và thứ tự triển khai. Chỉ đánh dấu M0 hoàn thành khi đủ 10 nhóm đầu ra ở tiêu chí M0 và mọi tính năng trong phạm vi có thiết kế triển khai, task và test. Kết thúc lượt ở đây.

## 10. Vòng lặp Implementation và Auto

Chọn task `READY` trong phạm vi được giao sau khi đối chiếu trạng thái thực tế. Đọc yêu cầu, ADR, hợp đồng và tiêu chí test liên quan. Thực hiện thay đổi nhỏ nhất đáp ứng task, tích hợp qua hợp đồng thật và bảo toàn hành vi đang được sử dụng. Kiểm tra bằng lint, typecheck, build, unit, integration, contract hoặc E2E phù hợp với task.

Nếu kiểm tra lỗi, tìm nguyên nhân, sửa trong phạm vi và chạy lại. Ghi kết quả thực tế. Chỉ đánh dấu `DONE` khi đáp ứng tiêu chí và có bằng chứng cần thiết. Dùng mock cho kiểm thử cô lập. Nghiệm thu luồng MVP phải chạy với dữ liệu SmartGym thật đã kiểm kê. Cập nhật `TASKS.md`, ADR, hợp đồng hoặc hướng dẫn khi thay đổi ảnh hưởng đến chúng.

Trong `AUTO`, tiếp tục với task đủ điều kiện tiếp theo trong mốc đích. Trước khi kết thúc, báo phạm vi thực sự hoàn thành, kiểm tra đã chạy, blocker, quyết định chưa chốt và task khả thi tiếp theo. Một mốc chỉ hoàn thành khi mọi task bắt buộc đạt tiêu chí nghiệm thu.

Trong AUTO, duy trì `docs/planning/AUTO_CHECKPOINT.md` theo `AGENTS.md`. Ghi mốc hiện tại, task hiện tại, việc đã làm, file đã sửa, lệnh/kết quả kiểm tra gần nhất, blocker và task khả thi tiếp theo. Khi mở lại phiên, đối chiếu Git hoặc danh sách file và kết quả kiểm tra. Task dở giữ `IN_PROGRESS` hoặc `BLOCKED`.

## Tài liệu kỹ thuật tham chiếu

- [Microsoft Azure Architecture Center về microservices](https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/microservices)
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)
- [AWS Builders’ Library về retry và idempotency](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
- [AWS Prescriptive Guidance về transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)

## Ràng buộc CMS và bàn giao AI

CMS là module của Catalog với đúng năm content type, không thêm service. Mọi dữ liệu động đi qua API thật, fixture chỉ dùng phát triển cô lập và kiểm thử. Tuân thủ [database](docs/design/DATABASE.md), [hợp đồng CMS](docs/api/API_CONTRACTS.md), [UI](docs/design/UI_UX.md) và [ADR](docs/adr/0001-service-boundaries.md) về revision, publish/restore, quyền, audit, media, import/export và event. Pose/RAG thuộc đội ngoài. Chỉ giao Web/Catalog/Progress phần tích hợp, làm rõ provider contract và staging; thiết kế AI baseline trước đây không phải yêu cầu xây nội bộ model, indexer hoặc pipeline.

## Quyết định công nghệ và kiểm chứng phiên bản

Áp dụng quy tắc ở [AGENTS.md](AGENTS.md) và ghi [bảng phiên bản](docs/guides/TECHNOLOGY_VERSIONS.md). Ưu tiên tài liệu chính thức đúng phiên bản, đối chiếu installed definitions/source và test có môi trường, đầu vào, kết quả tái lập. Khi thông tin mâu thuẫn, phân tích bằng chứng thực thi phù hợp thay vì chỉ áp thứ tự nguồn. Yêu cầu người dùng, ADR ACCEPTED và hợp đồng đã duyệt quyết định sản phẩm/kiến trúc.

Phiên bản chưa có manifest/lockfile là NOT_PINNED. Planning chỉ tra tài liệu và lập task pin, không cài dependency. Implementation pin và xác minh trong task được giao. Ghi riêng PINNED, INSTALLED, BUILD_VERIFIED và RUNTIME_VERIFIED, URL và ngày kiểm tra. Tài liệu rolling không chứng minh tương thích cho bản cũ. Không tự nâng dependency ngoài phạm vi. Prisma và Tailwind chưa được chọn, cần ADR nếu đề xuất. Khi ORM không hỗ trợ ràng buộc PostgreSQL cần cho nghiệp vụ, quản lý SQL migration thủ công và test.

Nếu cần đổi quyết định ACCEPTED, lập ADR PROPOSED, ghi tác động tới yêu cầu/API/database/task, chỉ BLOCKED phần phụ thuộc và tiếp tục phần độc lập. Chuyển ACCEPTED khi có căn cứ chấp thuận hợp lệ trong phạm vi ủy quyền. Hướng dẫn nhập môn bên ngoài là tham khảo, nghiệm thu theo thiết kế và phép kiểm tra của SmartGym.
