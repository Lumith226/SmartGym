# Review bàn giao Full System Planning

## Review phần kiểm chứng trước M6 — 2026-11-08

Chromium 51/51 và PostgreSQL TCP 38/38. Thư viện phục hồi khi Catalog restart mà Web tiếp tục chạy. Bản sao cold restore Catalog giữ dữ liệu, migration và quyền. Workout và Pose có cấu hình build container riêng đã đối chiếu với entrypoint đã biên dịch. Docker build, digest và rollout/rollback thực cần môi trường có Docker. [Kết quả kiểm thử](../planning/TEST_PLAN.md) · [Runbook](../guides/OPERATIONS.md#kiểm-chứng-cục-bộ-trước-m6)

T07 chờ trình đọc màn hình, thiết bị cảm ứng thật và quyền phát hành cho snapshot. T27 chờ corpus/index và model thật. T36 chờ xác nhận hợp đồng và consumer từ đội RAG. T26 và T28–T30 cần các phụ thuộc trên để nghiệm thu. T29 còn thiếu số đo SLO và diễn tập các kho trên môi trường đích. [Trạng thái](../planning/TASKS.md)

## Review adapter T27 — 2026-11-08

RAG-001/WEB-001/FLOW-08/SCR-13 đã nối schema → BFF owner/raw/provenance → provider contract → safe DTO → /hoi-dap và nguồn trích dẫn. Không dùng question/answer hai status của M0 để làm mất semantics; kb_version không gán Catalog revision. Bốn task hiện chưa có policy điểm: giữ null và diễn giải thiếu quy tắc, không quy đổi xác suất thành điểm. Token RAG khác JWT, ingress mTLS được yêu cầu, không giả FastAPI bàn giao tự có TLS. Registry operator chỉ KB đã được phép, full-text endpoint còn gap được giữ trong scope; không expose trace/raw/hash hoặc fetch tùy ý. Response 404/410 của Pose chấp nhận problem+json và giữ nghĩa owner/expiry. Transcript memory, noindex/referrer policy, abort/clear/late response và reauth trước trả đã có test.

BFF13/13, Chromium6/6, Auth/CMS/Pose import18/18, authBFF9/9, ProgressBFF8/8, workspace/system2/2, contracts87/AI5/5/boundaries/frozen PASS; mobile ảnh đã xem. Fixture source/probability không phải inference/corpus thật; seed INSERT giữ Pose immutable trigger. Chưa có real corpus/index/generate, provider full-text access hoặc target ingress: T27 BLOCKED theo tiêu chí gốc, tổng32/39 DONE. Các lựa chọn45s/2request/process/5phút/key là budget local, phải kiểm load và ingress quota đa replica tạiT29; abort HTTP chưa xác lập Python/LLM đã dừng. Không thêm dependency/migration/service hoặc sửa nguồn bàn giao. [ADR0023](../adr/0023-rag-web-adapter.md)

Thứ tự tiếp thực tế: hoàn tất gate thủ công T07 và nhận corpus/index/endpoint + source rights/model runtime từ provider để nghiệm thu T27; chốt Catalog feed ACK/consumer/staging mởT36/T26; sau đó T28 fault/full integration, T29 security/load/backup/restore/operations và T30 release. Không tự chuyển các feature chưa có bằng chứng thành DONE hoặc bỏ khỏi phạm vi. Hiện không có task READY theo DAG; không tiếp triển khai release khi các gate này chưa đạt.

## Review producer T36 — 2026-11-08

ADM-002/RAG-002 đã có API/head/snapshot/events, migration 008, auth riêng và relay Catalog; cache feed tách export CMS, tránh đổi retention/hành vi CMS đã nghiệm thu. Tombstone dựa publication history và reason lưu bền, không mất sau restore nháp hoặc purge outbox. REPEATABLE READ + advisory lock/capture retry giữ head/data/hash nhất quán; consumer vẫn phải chống reorder và reconcile vì request có thể chụp trước một commit mới. Không tuyên bố exactly-once hoặc thu hồi tức thời xuyên service. Media revoke fail closed cả head/cached snapshot, nhưng tự động cascade-unpublish chưa có: operator xử lý theo runbook. Snapshot bị giới hạn, quá ngưỡng trả lỗi, chưa có chunk protocol hoặc purge scheduler tự động.

Producer local/CMS/media đạt 45/45, Catalog migration/unit 9/9, Auth/CMS Chromium 13/13, workspace build/system 2/2 và contracts/boundaries/frozen lockfile PASS; bộ feed cuối 16/16 gồm purge outbox kiểm lưu reason theo test plan. [ADR 0022](../adr/0022-catalog-rag-producer.md) và [handoff YAML](../api/catalog-rag-handoff.yaml) ghi rõ phạm vi ACCEPTED chỉ phía producer, freshness/topology consumer còn PROPOSED. Provider thiếu consumer/corpus/index, user xác nhận không có bản mới; không thực thi scripts hoặc sửa REFERENCE_ROOT. T36 giữ BLOCKED ở provider ACK/staging, T26 không tự mở; tổng 32/39 DONE. T27 có thể phát triển DTO/BFF/readiness độc lập nhưng không nghiệm thu generation trước corpus thật. Container/HA/rotation/production restore vẫn thuộc M6. Không có mâu thuẫn mới buộc thay bảy ranh giới service; thiếu sót tích hợp được giữ thành gate cụ thể, không gắn nhãn DONE.

## Review triển khai T25 — 2026-11-08

PRG-003/POS-003 và FLOW-06/07 có importPoseResult/getPoseResultForProgress, schema ImportedPoseSummary, owner API/client, receipt/snapshot/unique có sẵn và UI xác nhận. Không đọc raw/DB/object Pose hoặc sửa model. Nguồn VIDEO chưa đếm rep, live count=0 được chặn có giải thích; một set gộp không giả phân set/weight/duration/form quality. Timestamp mặc định giữ completedAt chính xác khi UI chưa sửa; actual và optional occurrence do người dùng xác nhận. Snapshot model/config/result metadata riêng với actual sets, sửa không thay gốc; xóa scrub payload và giữ reservation. [ADR 0021](../adr/0021-pose-progress-import.md)

API 11/11, BFF 8/8, Progress hồi quy 16/16, Chromium nhập/nhật ký 10/10, workspace build, system 2/2, contracts/boundaries/frozen offline install đã đạt. UI alert/select đã có nhãn rõ, mobile screenshot và axe đã kiểm. Hồi quy Pose V4 CPU/upload/live/browser thật **11/11** đã đạt, gồm inference độc lập và dừng camera giả lập. Sửa bootstrap cache trước import Playwright và locator số rep exact; không đổi engine/weights. T25 không còn lỗi nghiệm thu mở. Fixture summary của test import và bằng chứng inference thật được ghi tách. Không có migration hoặc công nghệ mới; config Pose client/allowlist và BFF reader có runbook, thiếu Pose chỉ chặn nhập mới. T07 và RAG/staging/operations vẫn có cổng riêng. Tiếp theo rà soát hợp đồng Catalog–RAG T36 trong WRITE_ROOT, không tự sửa nguồn provider hoặc khẳng định đội RAG đã chấp thuận.

## Review triển khai T20 — 2026-11-08

NTF-001/NTF-002, SCR-06/14 và FLOW-09 có bốn API, owner DB queries, BFF/schema sinh, UI/routes và tests tương ứng. NotificationPage bổ sung unreadCount để badge không đếm riêng trang. Keyset giữ microsecond + UUID tie-break, read COALESCE idempotent và preference ETag/owner lock dùng lại T19. Không tăng service scope, migration hoặc dependency. API bật có chủ đích, Identity sở hữu tài khoản/JWKS/contact và Notification không đọc DB chéo. [ADR 0020](../adr/0020-notification-inbox-web.md)

Backend 11/11, BFF 8/8, auth BFF 9/9, reminders 18/18 và Chromium hồi quy 25/25 đã đạt. UI giữ draft 412/401, polling chỉ visible, request được hủy khi unmount, thông báo đã gửi mở được trạng thái Workout đã hủy. Automated axe/viewport/keyboard và ảnh mobile đã kiểm, không thay manual accessibility. Lượt cuối Notification **8/8** sau build mới, gồm read 401 xóa cached inbox; workspace build/system **2/2**, contracts/boundaries và frozen offline install PASS. T20 không còn lỗi nghiệm thu đang mở. JSON null/oversize và logout request được căn với parser/hợp đồng hiện hành, không bỏ kiểm quyền hoặc assertion. Runbook nêu flag/fingerprint/issuer/BFF TLS, default worker-only compatibility và thao tác đối chiếu sau PUT không rõ kết quả. Các task M4 hoàn thành kỹ thuật không tự đóng cổng M3/T07 hoặc M6; corpus/index RAG và môi trường đích vẫn chưa nghiệm thu. T25 nhập Pose là task độc lập kế tiếp đủ phụ thuộc.

## Review triển khai T19 — 2026-11-08

Đối chiếu NTF-002/FLOW-05/FLOW-09, event Workout, contact API Identity, Notification schema và TST-19. Không có DB/source import chéo hoặc đổi envelope. Projection/version/tombstone, hai channel jobs và owner lock bảo vệ duplicate/reorder/cancel, SMTP dispatch/UNKNOWN giữ đúng bằng chứng. In-app insert và SENT commit cùng transaction; preferences bảo mật độc lập auth email. Thông báo đã gửi giữ lịch sử, cần mở occurrence để đọc trạng thái hiện tại. [ADR 0019](../adr/0019-notification-reminders.md)

T19 18/18, email 9/9, Notification PGlite 11/11, workspace build/system 2/2, contracts/boundaries/frozen offline install PASS. Các lỗi truy vấn partial unique và fixture topology đã sửa, retry test đã căn đúng clock/backoff. Không còn lỗi nghiệm thu T19 đang mở. Runbook yêu cầu drain binary cũ trước migration 002, provision thêm queue/read ACL và không rollback binary T09 với schema mới. Readiness hiện yêu cầu cả hai consumer; không nhầm cấu hình cũ với worker hỏng. Không khẳng định hủy tức thì xuyên service hoặc exactly-once SMTP. T20 chưa có HTTP/UI inbox/preferences; T07, corpus/index RAG và staging/container/HA/SLO/retention vẫn giữ cổng riêng. T20 tiếp theo, rồi T25 nhập Pose vào Progress và các task RAG có dữ liệu thật. M4/M6 chưa hoàn thành toàn bộ.

## Review triển khai T18 — 2026-11-08

Đối chiếu PRG-001/PRG-002, SCR-06/10/11, API log/summary, SQL và TST-18. Summary giữ ownership trong Progress, dùng một câu SQL cùng snapshot, per-log trước per-day, numeric và local-date range tối đa 366 ngày. Không thêm cache/job/migration. BFF sáu operation dùng mTLS/assertion và contract sinh, không import backend source. UI giữ draft/ETag/key, link duplicate được kiểm UUID, biểu đồ và bảng cùng dữ liệu. Dashboard không giả trạng thái notification hoặc đổi quyền sở hữu completion/lịch. [ADR 0018](../adr/0018-progress-summary-ui.md)

Backend 16/16, Chromium Progress 5/5 và visual 1/1, BFF Progress 7/7, BFF auth 9/9, hồi quy auth/CMS/Planner 18/18 và system 2/2 PASS. Build/contracts/boundaries/frozen install đạt. Đã kiểm ảnh mobile và desktop, axe chỉ chứng minh phần tự động trên main tiến độ, không thay kiểm screen reader/thiết bị thật. T18 không còn lỗi nghiệm thu đang mở. T19/T20 tiếp tục nhắc lịch/inbox, T25 import Pose đủ phụ thuộc, RAG còn corpus/index, T07 và các cổng vận hành vẫn mở. M4 chưa đóng toàn bộ.

## Review triển khai T17 — 2026-11-07

PRG-001 có năm API log, schema request/response tách snapshot chỉ đọc, database Progress riêng và task/test tương ứng. getWorkoutOccurrenceForProgress hiện thực trên Workout với allowlist Progress tách khỏi BFF. Log không phụ thuộc dữ liệu mutable của lịch sau khi đã lưu snapshot, không có ghi DB chéo hoặc transaction phân tán. Receipt/delete đã căn chỉnh: 410 sau xóa thay vì trả lại payload, unique source giữ qua TTL. Set actual dùng anyOf rep/thời lượng, numeric không ép scale và ordinal duy nhất theo bài. [ADR 0017](../adr/0017-progress-log-ownership.md)

Progress 13/13 và Workout 30/30 với PostgreSQL thật, system 2/2, build, schema/contract/boundaries và frozen lockfile PASS. Chưa có lỗi bắt buộc đang mở ở T17. Quyết định cho phép log thực tế buổi đã hủy hoặc tập sớm, từ chối performedAt tương lai và thứ tự set đã ghi rõ. T18 chưa có summary/BFF/UI, T25 chưa import Pose, Docker artifact mới chỉ là source chưa build/tag/digest. T07 còn kiểm thủ công/quyền phát hành, RAG thiếu corpus/index thật, staging và hardening cần T28/T29. T17 DONE không đóng toàn bộ M4.

## Review triển khai T16 — 2026-11-07

Đối chiếu WKT-001–003, SCR-07–09 và FLOW-04/05 với 14 operation Workout, GET picker Catalog, schema sinh, route riêng và TST-16. BFF dùng assertion mới/mTLS, không sở hữu dữ liệu hoặc import source backend. UI dùng ETag phản hồi mới, giữ input khi 409/412/401 và giải thích phạm vi hủy chuỗi so với buổi riêng. Temporal 0.5.1 pin riêng ở Web, cùng policy DST với Workout và có ca kiểm khác múi giờ thiết bị. [ADR 0016](../adr/0016-workout-planner-bff.md)

Năm ca Workout Chromium đã đạt qua lượt chung và lượt chọn lọc sau sửa dữ liệu test, auth/CMS 13/13 với media thật, BFF/time 10/10, auth BFF 9/9 và system 2/2 PASS. Một ca dời chọn khung còn chồng bị backend chặn đúng, đã thêm assert lỗi rồi kiểm khung tiếp giáp. Không còn lỗi code bắt buộc đang mở trong T16. Layout bốn breakpoint và zoom 200% không tràn, axe 0 violation trên main lịch đã quét, không suy ra đạt toàn bộ WCAG hoặc kiểm thiết bị thật. Chưa có Progress T17/T18, reminder T19/T20, RAG corpus/index và cổng môi trường đích. T16 DONE không đóng toàn bộ M4. T17 là việc kế tiếp đủ điều kiện.

## Review triển khai T15 — 2026-11-07

Đối chiếu WKT-002/WKT-003, bốn mutation lịch/buổi, migration 003, outbox và kế hoạch. [ADR 0015](../adr/0015-workout-schedule-reconciliation.md) cụ thể hóa phạm vi PUT giữ override và DELETE hủy mọi buổi tương lai, giữ lịch sử đã bắt đầu. ID/key không đổi khi đổi giờ trên cùng ngày gốc. Cập nhật ma trận WKT-002 để bao gồm T15. Sửa tên exchange trong API_CONTRACTS từ smartgym.domain.v1 thành smartgym.events.v1 cho khớp runtime/provisioning đã có. Đây là sửa lệch tài liệu, không đổi topology runtime.

PASS 30/30 Workout trên PostgreSQL 18.6 và RabbitMQ 4.4.0, gồm hai writer cùng version, chống overlap, rollback event, hai replica và lỗi projection có checkpoint. Build, contract 87 operation, boundaries, frozen offline install và system 2/2 PASS. Worker dùng credential DB Workout riêng, API giữ mTLS/owner, broker lỗi không chặn ghi outbox. Chưa nghiệm thu BFF/UI T16, reminders T19, giám sát/load/container/TLS đích T28/T29. T07 còn trợ năng thủ công và quyền phát hành. RAG cần corpus/index thật, không dùng fixture thay bằng chứng tích hợp. T16, T17 và T19 đã đủ phụ thuộc kỹ thuật. [Bằng chứng](../planning/TEST_PLAN.md) · [Vận hành](../guides/OPERATIONS.md#chỉnh-lịch-và-materializer-t15)

T23 dùng chung biên dữ liệu Pose của T22. BFF kiểm cookie/Origin, Pose claim theo owner và giao thức V4 chạy qua mTLS. Session live và result có quan hệ một-một. Raw observation giữ scope ban đầu, summary vẫn phục vụ phiên chưa đủ raw. Phần giao diện và hành vi dừng camera thuộc T24. [ADR 0012](../adr/0012-pose-live-session.md)

Đây là hồ sơ review M0. Phạm vi thiết kế là toàn bộ [PRD](../design/PRD.md), gồm bảy ranh giới nghiệp vụ, tám khu vực UI cùng thông báo, và vận hành. M1–M3 là thứ tự Development cho thư viện. M4–M6 đưa các luồng còn lại đến nghiệm thu toàn hệ thống.

## Review nghiệm thu engine T21 — 2026-11-07

T21 DONE trong phạm vi nhận engine: bốn bài đủ ba scope raw, 14 raw fixtures qua validator RAG, regression 16/16, hash và count contract đạt. Runtime CPU có lock/hash riêng; giới hạn OpenCV cùng namespace ghi trong ADR 0010. T22/T23 READY để xây authenticated adapter, owner và jobs/live. Không tính smoke in-process là nghiệm thu microservices deployment, GPU, chất lượng hoặc chatbot có corpus. Thiếu corpus/index và canonical rules đã được hỏi lại, không tự tạo tri thức thay thế. [Bằng chứng](../api/ai-runtime-verification.yaml)

## Review đối chiếu nguồn trước runtime T21 — 2026-11-07

Tiếp tục T21: contract repCount đã sửa nullable với trạng thái availability, VIDEO V4 chưa đếm rep; capability khai báo đếm riêng hai mode. Công cụ kiểm nguồn và 5 ca contract PASS. API nội bộ raw/provenance và DTO chat chưa căn chỉnh, inference/transport auth chưa nghiệm thu, nên cờ NEEDS_PROVIDER_ALIGNMENT vẫn giữ. Không đánh đồng test API tổng hợp với output thật của model.

Người dùng xác nhận KB/RAG ở smart-gym-ai và Pose ở SmartGym. Giữ NestJS và các service hiện có. Pose FastAPI V4 và RAG `/v1/chatbot` dùng bốn contract JSON giống từng byte và model digest khớp. Hash contract trong registry dùng UTF-8 LF, manifest lưu thêm hash bytes CRLF để tái lập kiểm tra. [AI integration](../design/AI_INTEGRATION.md) · [Manifest](../api/ai-provider-compatibility.yaml)

Đã sửa nguồn chuẩn trong prompt/AGENTS và thay giả định SQLite/provider cũ. Các lệch P0 còn ở DTO chat, raw result theo owner, repCount whole-video, protocol live, auth và durable jobs. OpenAPI đánh dấu operation AI cần căn chỉnh tại T21/T22/T23/T27. Feed Catalog chưa có consumer provider, T26/T36 vẫn là cổng của full scope. T21 READY để nhận bàn giao, không tính review tĩnh là nghiệm thu inference.

Provider raw/index hiện chỉ có .gitkeep, curated chưa có corpus. File Chapter4 rules trong thư mục cha thiếu. Chỉ đọc mã/hash, không thực thi script hoặc sửa nguồn provider. Inference, Ollama, Neo4j và E2E AI là NOT RUN. Các task backend đã nghiệm thu vẫn giữ trạng thái. Quyết định mới theo [ADR 0008](../adr/0008-ai-provider-handoff.md).

## Mười đầu ra

Review T34: bốn operation import/export đã có runtime, migration 007 giữ bảng bootstrap và revision cũ. Validate không commit nội dung; apply chống lost update và rollback cả batch/receipt. Export public kiểm visibility/media, có checksum/TTL, không tái dựng sai lịch sử. Giới hạn được ghi rõ: UI/BFF T35, RBAC/audit toàn bộ T37, feed RAG T36 và vận hành staging T28–29. Không áp dụng export Catalog vào corpus sách/HTML đang có bên RAG. Ở thời điểm T34, T21 còn chờ runtime. Hiện cổng nhận engine T21 đã DONE theo phần review mới bên trên.

| Đầu ra | Bằng chứng thiết kế |
|---|---|
| Product specification | [PRD](../design/PRD.md), [luồng](../design/USER_FLOWS.md) |
| Microservices architecture | [Kiến trúc](../design/ARCHITECTURE.md), [ranh giới](../design/SERVICE_BOUNDARIES.md), [ADR](../adr/0001-service-boundaries.md) |
| Backend và database | [Database](../design/DATABASE.md), [hợp đồng](../api/API_CONTRACTS.md), [OpenAPI](../api/openapi.yaml), [event schemas](../api/events.yaml) |
| Frontend và UI/UX | [UI/UX](../design/UI_UX.md), [kiến trúc frontend](../design/FRONTEND_ARCHITECTURE.md) |
| Pose và RAG | [AI integration](../design/AI_INTEGRATION.md), [audit nguồn](REPOSITORY_AUDIT.md) |
| Security và infrastructure | [Security](../design/SECURITY.md), [Operations](../guides/OPERATIONS.md) |
| Roadmap | [M0–M6](../planning/IMPLEMENTATION_PLAN.md) |
| Task breakdown | [Tasks](../planning/TASKS.md) |
| Test và acceptance | [Test plan](../planning/TEST_PLAN.md), [ma trận](../planning/TRACEABILITY.md) |
| Review | Tài liệu này và [AGENTS](../../AGENTS.md) |

## Các điểm đã thống nhất khi kiểm tra chéo

- Full System Planning thay phạm vi library-first trong master prompt. Identity, Workout, Progress, Notification và Admin có hợp đồng, mô hình dữ liệu, giao diện và test như các phần khác.
- WebSocket dùng cookie cùng origin qua BFF, xác thực người sở hữu và claim một socket mỗi phiên. Bỏ phương án ticket riêng. Signup/resend dùng phản hồi trung tính. Tài khoản chưa xác minh không nhận cookie đăng nhập.
- Lịch chồng bị chặn ở DB. Xung đột phát hiện khi mở rộng cửa sổ là projection conflict riêng. Workout occurrence vẫn giữ trạng thái nghiệp vụ của nó. Notification dựa trên phiên bản hiện hành và kiểm tra trước khi gửi.
- Với nhắc lịch, hủy sau khi áp dụng revision mới có hiệu lực với delivery đang chờ. Email đã được provider tiếp nhận là điểm không thể thu hồi, được ghi nhận trong runbook và ca test race.
- Progress nhập kết quả Pose bất biến theo ID qua yêu cầu chủ động. Một kết quả chỉ gắn được với một log theo chính sách. File thô và frame ở biên Pose.
- RAG có endpoint đọc head để đối chiếu event mất. Revision và visibility được kiểm trước khi phục vụ trích dẫn. Giới hạn freshness đi cùng cổng phục hồi. Catalog phục vụ độc lập với AI.
- Ca bàn phím, viewport, zoom, auth/ownership, retry và restore được gắn vào các mốc nghiệm thu thay vì chỉ mô tả chung.

## Quyết định và giới hạn còn mở

| Chủ đề | Baseline đủ để thiết kế | Điều kiện còn lại |
|---|---|---|
| Runtime, hosting và quy mô | Web Next.js/TypeScript, NestJS cho 5 service, FastAPI/Python cho Pose và RAG, PostgreSQL phân quyền, RabbitMQ, object storage | Pin phiên bản khi bootstrap. Chốt host, vùng dữ liệu, provider, tải và SLO tại M6. |
| Tài khoản, múi giờ, gửi nhắc | Email/password và role USER/ADMIN. Lịch theo IANA, cửa sổ 35 ngày, mặc định nhắc 60 phút theo preference | Xác nhận policy đăng nhập, quản trị, SMTP/provider và timezone/retention trước release. |
| Nguồn legacy | 33 bài chính, 2 bổ sung camera, adapter Pose và RAG | Quyền dùng media, SVG và weights, clip xác minh biến thể, model runtime, kết quả chất lượng/độ trễ phải được chứng minh ở mốc liên quan. |
| Giới hạn AI và dữ liệu | Upload/webcam beta, raw media tạm tối đa 24 giờ và kết quả Pose 30 ngày | Chốt quyền, môi trường, chất lượng, ngưỡng, chính sách lưu/xóa và bộ test trước M5/M6. |
| Phát hành | Staging cách ly, cấu hình bí mật, khả năng nâng từng service, rollback và restore có drill | Cần artifact, test và phê duyệt thực tế trong Development. |

## Bàn giao thực hiện

Thứ tự thực tế là **T01 workspace và biên build → T02 import Catalog → T03 API → T04 lát cắt Web → M2/M3 → M4 các luồng riêng tư và admin → M5 AI → M6 kiểm thử, vận hành và release candidate**. Task khả thi đầu tiên khi có quyền Development là **T01**. Xem [roadmap](../planning/IMPLEMENTATION_PLAN.md).

## Kết quả xác minh M0

| Kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
| Phạm vi ghi và liên kết | PASS | 23 file cho handoff, gồm 21 Markdown và 2 YAML. Không có link nội bộ hỏng trong lần đọc cuối. |
| Truy vết và phụ thuộc | PASS | 32 requirement có ánh xạ vào component, API/dữ liệu, task và test. 37 task, 37 test, không có ID trùng, phụ thuộc thiếu hoặc vòng lặp. |
| Hợp đồng | PASS ở mức cấu trúc | Hai hợp đồng dùng JSON-compatible YAML. Parse thành công, tham chiếu nội bộ giải được, 68 HTTP paths, 84 operation IDs duy nhất, 5 event types. So tham số path, thành công, bảo mật nội bộ và requirement IDs. |
| Trình kiểm chuẩn OpenAPI/JSON Schema đầy đủ | NOT RUN | Không có validator phù hợp đã cài trong môi trường Planning. Thêm validation chuẩn và kiểm thử payload vào T01/T28. |
| Mermaid | PASS ở mức cấu trúc | 18 khối Mermaid với fences cân bằng. Render hoặc lint Mermaid chuyên dụng là NOT RUN vì thiếu công cụ phù hợp. |
| Runtime, container, inference và E2E | NOT RUN | Kiểm kê nguồn theo file, Git status và hash. Các phép chạy ứng dụng được thiết kế trong test plan cho Development. |

M0 hoàn thành ở mức bàn giao thiết kế. Các trạng thái `TODO` trong [tasks](../planning/TASKS.md) là công việc Development, và các mục cần xác nhận ở trên vẫn là cổng của mốc tương ứng.

## Delta M0 — Custom Headless CMS

- Quyết định đã xác nhận. CMS nằm trong Catalog và Admin Web gọi API. Giữ bảy backend. Có đúng năm content type. Nguồn kiến thức chung đã duyệt là phụ lục kỹ thuật cho snapshot. Pose/RAG là dependency bên ngoài.
- Đã thống nhất state ARCHIVED thay cho trạng thái UNPUBLISHED trong admin, giữ tên endpoint/event unpublish cho thao tác gỡ công bố. Bản public được pin, restore thành nháp, tham chiếu đang public chặn archive support, import chỉ apply vào nháp.
- Đã đồng bộ requirement ADM-003–007 và ADM-001/002 hiện có với CRUD, revision, media, import/export, auth/audit. Bổ sung T31–T37 và TST-31–37, sửa M4/M5, WebSocket và worker AI giữ ở biên bàn giao.
- Đã đọc và kiểm tra phạm vi file bằng danh sách/hash vì WRITE_ROOT chưa có Git. Hợp đồng JSON-compatible YAML parse thành công, các ref nội bộ/operation/path params/admin guards hợp lệ. Kiểm coverage, graph phụ thuộc, cấu trúc Markdown/Mermaid và link file. Formal schema validator và Mermaid render là NOT RUN. Chưa chạy runtime.
- Chờ xác nhận môi trường staging và phiên bản hợp đồng với đội RAG, quyền media/SVG, hạn retention và giới hạn upload, TTL thực tế. V1 dùng ADMIN cho toàn bộ workflow. REVIEW/tách quyền editor–publisher là quyết định đề xuất nếu nghiệp vụ cần.

**Phạm vi file đã sửa.** Master Prompt và README. Trong docs gồm PRD, USER_FLOWS, UI_UX, FRONTEND_ARCHITECTURE, ARCHITECTURE, SERVICE_BOUNDARIES, DATABASE, API_CONTRACTS, SECURITY, OPERATIONS, AI_INTEGRATION, REPOSITORY_AUDIT, IMPLEMENTATION_PLAN, TASKS, TEST_PLAN, TRACEABILITY, DESIGN_REVIEW, ADR 0001 và hai hợp đồng YAML. Đã cập nhật 22 file tại chỗ. Không thêm bộ tài liệu song song.

## Bằng chứng bổ sung trong Development M1

Các kết quả NOT RUN ở M0 là lịch sử của Planning. Tại Development, đã chạy Swagger Parser cho OpenAPI 3.1 và references, Ajv cho JSON Schema 2020-12 và payload API, PostgreSQL server 18.6 qua TCP, build Web/Catalog và hai browser test Chromium. Chi tiết, phiên bản và giới hạn ở [checkpoint](../planning/AUTO_CHECKPOINT.md), [toolchain](../guides/TECHNOLOGY_VERSIONS.md) và [ADR 0002](../adr/0002-m1-toolchain-and-verification.md). Docker/Compose vẫn NOT RUN do thiếu CLI.

T38 bổ sung backend M2, snapshot 35 bài và migration 002, cùng 8 ca Catalog và 3 ca Chromium đã đạt. Ma trận giữ 32 requirement, nay có 38 task/test case thiết kế. T38 phục vụ CAT-001–003. Dữ liệu/taxonomy đang ở development-only, bốn biến thể chờ clip và quyền media có cổng phát hành riêng. [Checkpoint hiện tại](../planning/AUTO_CHECKPOINT.md)

T39 đổi bố cục monorepo theo yêu cầu người dùng thành frontend/ và backend/services/. Cập nhật workspace, lockfile, paths, Dockerfiles và tài liệu. Build và regression PostgreSQL, HTTP/system và Chromium đã đạt. Có 39 task/test case thiết kế sau bổ sung T39 cho SYS-001 và WEB-001. Package identity và các hợp đồng tiếp tục dùng như thiết kế. Docker build vẫn NOT RUN vì thiếu CLI.

## Review triển khai Identity T08

Ngày 2026-11-07. Backend Identity đã có package/database/migration và mTLS runtime riêng theo ADR 0003. Đã đối chiếu 13 operation Identity với OpenAPI, payload email với event schema, schema thực với DATABASE và task với requirement IDN-001–004. Không tăng số operation hoặc thay wire contract browser; x-backend-* bổ sung transport/ACL private còn thiếu. Đổi T08 phụ thuộc thành T01/T03 để phát triển độc lập với UI, giữ T07/M3 là cổng release. Schema request sinh từ hợp đồng và kiểm drift tự động.

PASS Identity 18/18 trên PostgreSQL 18.6 với role/database riêng, gồm config/migrate/start trong process riêng; Catalog 8/8, build ba package và system 2/2. PASS contract/event/generated schema và boundary checks. Test nhanh Identity dùng PGlite ghi đúng 16 PASS/2 SKIP; hai ca đó đã chạy không skip trên TCP. Không sửa frontend nên không chạy lại browser trong task này. Đã sửa kỳ vọng test POST JWKS từ 403 thành 404: route POST không tồn tại, router từ chối trước controller guard; GET vẫn kiểm ACL.

Tại thời điểm review T08, relay/broker/email sandbox T09 chưa hoàn thành; kết quả T09 mới được ghi ở phần kế tiếp. Web auth T10; container/image digest và least-privilege runtime DB/audit T28; tải/rotation drill T29 vẫn có cổng riêng. Cipher delivery key chỉ được đổi sau drain action còn hiệu lực hoặc sau bổ sung keyring migration; JWT hỗ trợ JWKS public cũ+mới. Không suy ra nghiệm thu browser signup/reset hay toàn bộ M4 từ kết quả backend.

## Review Notification T09

Đã đối chiếu event identity.email-action.requested.v1, resolveEmailDelivery, migration Identity 002/Notification 001 và requirement NTF-003/IDN-001/003. Không đổi payload/API version hoặc thêm domain service. Schema provider/consumer sinh từ tài liệu và kiểm drift. Notification sở hữu inbox/job/attempt/operator evidence; Identity giữ action/secrets/outbox. Chỉ liên lạc qua RabbitMQ và mTLS, đã kiểm role DB chéo và broker publisher/consumer ACL thực.

PASS 11/11 delivery tests trên PGlite và PostgreSQL TCP/SMTP sandbox; E2E 9/9 với PostgreSQL 18.6, RabbitMQ 4.4.0 và Erlang 28.5.0.7. Bao gồm hai relay/worker claim, confirm mất, unroutable retry, poison DLQ, token trong thư dùng được một lần, reset revoke session và independent process configuration/start. Dừng broker giữ Identity ready; Notification live nhưng not-ready. Đã sửa cách diễn giải timeout sau khi installed Nodemailer source cho thấy SOCKET_TIMEOUT vẫn mang command=CONN. Test chứng minh UNKNOWN không tự retry, operator evidence mới cho mở lại. Không lưu raw token/email/link hoặc provider error vào Notification DB/log.

Trong kiểm tra tooling, script .ps1 bị execution policy của Windows PowerShell chặn; công cụ chuẩn bị đã đổi sang Node và tar.exe có sẵn, không đổi policy hoặc cài hệ thống. Runtime ZIP đã kiểm SHA-256 từ release metadata và chạy broker thật, dữ liệu/process kiểm thử được dọn. Container build, TLS AMQP/SMTP staging, production provider/domain và broker HA/durability drills còn T28/T29. T09 DONE cho backend email sandbox; T10 READY. M2/M3 còn UI/release, M4 còn UI/CMS/Workout/Progress/reminder/inbox, topology đủ bảy backend vẫn nghiệm thu M6.

## Review Web auth T10

Chín operation auth/profile khớp OpenAPI và schema sinh tự động. BFF lấy địa chỉ IP từ socket trực tiếp và xác thực Identity qua mTLS. Tài khoản và role vẫn do Identity sở hữu. Test bao phủ cookie, CSRF, quyền ADMIN, timeout, fragment và thu hồi phiên. Đạt 9/9 BFF, 9/9 Chromium gồm sáu ca auth và ba ca thư viện, 2/2 system. Khi Identity lỗi, tài khoản có trạng thái phục hồi và thư viện tiếp tục chạy.

Custom Node HTTPS là lựa chọn triển khai của T10 để BFF lấy địa chỉ peer. Ingress staging cần kiểm lại trust boundary nếu kết thúc TLS ở proxy. Trang admin hiện thực thi gate và hiển thị quyền, còn API thao tác CMS thuộc T11. [ADR 0005](../adr/0005-web-auth-bff.md) · [Runbook](../guides/OPERATIONS.md#web-auth-t10)

## Review Catalog Admin T11

Tám operation được đối chiếu OpenAPI và listener riêng. Kiểm thử trực tiếp với PostgreSQL xác nhận mTLS/JWT, hai writer tranh cùng ETag, idempotency, bản công khai bất biến khi lưu nháp, alias và audit/event commit nguyên tử. Bản phát triển hỗ trợ công bố bài tập dạng văn bản. BFF/UI, catalog media và relay broker thuộc T12, T31/T33 và T36 tương ứng. Staging cần cấu hình trust và quyền DB runtime trước rollout. [ADR 0006](../adr/0006-catalog-exercise-publication.md)

## Review Admin Dashboard T12

Tám operation BFF dùng schema sinh từ OpenAPI hiện có. BFF lấy assertion ADMIN mới từ Identity, gọi Catalog bằng mTLS và trả kết quả đã kiểm schema với `no-store`. Catalog giữ quyền ghi nháp, publish và audit. Preview đọc nháp đã lưu, còn thư viện đọc revision công bố. Tổng quan hiển thị các bài vừa cập nhật vì API danh sách trả trang và cursor.

Hai ca CMS Chromium đạt trên bản build cuối. Lượt đầu phát hiện form và audit dùng trùng React key. Đã tách key và kiểm lại form bằng truy vấn theo nhãn. Bộ lọc trạng thái và thứ tự dùng label liên kết rõ ràng. Media và biến thể trong bản nháp thuộc quy trình duyệt của T31/T33, khôi phục thuộc T32, relay thuộc T36. Nghiệm thu này chạy cục bộ, staging và production chưa được kiểm thử. [TST-12](../planning/TEST_PLAN.md) · [Runbook](../guides/OPERATIONS.md#admin-dashboard-t12)

## Review Catalog CMS T31

Đối chiếu bảy operation OpenAPI, bốn loại payload, migration 004 và các consumer hiện có. Catalog dùng owner riêng theo loại, pin revision trong SQL và cập nhật head cùng giao dịch. Tài liệu audit bổ sung action ARCHIVE/RESTORE tương thích với Web dashboard. Bootstrap và nâng schema cũ giữ ID, dữ liệu public và thứ tự nhóm cơ cũ. Hợp đồng event bài giữ phiên bản hiện có.

Nghiệm thu PostgreSQL xác minh race ở cả hai thứ tự và giữ revision variant đang được bài công khai dùng. Media metadata được thử với upload READY trong fixture. Luồng upload, scan và phát object thật thuộc T33. UI/BFF bốn loại hỗ trợ thuộc T35. Migration 004 đã chạy trên database kiểm thử cục bộ. Staging, production và diễn tập rollback còn ở cổng vận hành. [TST-31](../planning/TEST_PLAN.md) · [Runbook](../guides/OPERATIONS.md#catalog-cms-t31)

## Review lịch sử Catalog T32

Đối chiếu bốn operation T32 với OpenAPI, revision lưu trong database và audit consumer. Migration 005 chặn ghi đè nội dung bài tập và bổ sung phiên bản nguồn. Lịch sử dùng snapshot gốc cho bản public có audit công bố, còn bootstrap hiển thị tác giả trống. Restore giữ stable ID và không đổi con trỏ public, alias hoặc head. Audit vẫn ghi riêng những thao tác lifecycle không tạo snapshot.

Kiểm thử mTLS xác nhận xử lý đồng thời, retry, bảo vệ API và dữ liệu trước migration. Màn hình thao tác và BFF lịch sử thuộc T35. Staging và production chưa kiểm thử. [TST-32](../planning/TEST_PLAN.md) · [Runbook](../guides/OPERATIONS.md#lịch-sử-catalog-t32)

## Review media Catalog T33

Đối chiếu bốn operation upload/preview, public gateway mới, migration 006, Media revision pin và các consumer. Tổng OpenAPI là 85 operation. AWS SDK và presigner pin 3.1161.0, runtime tools thử pin SHA-256. API và verifier là các process thuộc Catalog, giữ quyền sở hữu dữ liệu trong biên Catalog. BFF/màn hình upload thuộc T35, trình bày media public đầy đủ thuộc T06.

Nghiệm thu cục bộ kiểm năm MIME, S3 versioning/conditional upload, decoder thật, scan bằng ClamAV với chữ ký thử, lỗi scanner, lease fencing, public byte range, revocation và GC bảo toàn lịch sử. Trong lượt đầu schema điều kiện sizeBytes thiếu type bị Ajv strict từ chối khi runtime compile. Đã sửa hợp đồng và compile toàn bộ request schema khi khởi động. Tệp PNG bị cắt trả lỗi dimensions tại probe trước bước decode, ca test đã phản ánh đúng thứ tự kiểm.

Provider S3 production, IAM/CORS, signature production, sandbox tài nguyên decoder, Linux container và tải còn nghiệm thu staging/T28–29. MinIO community download trả 410 nên fixture dùng SeaweedFS, không xác lập provider production. Preview đã ký có TTL tối đa 60 giây. Snapshot Media còn giữ luôn chặn GC. [TST-33](../planning/TEST_PLAN.md) · [ADR 0007](../adr/0007-catalog-media-storage.md) · [Runbook](../guides/OPERATIONS.md#media-catalog-t33)
