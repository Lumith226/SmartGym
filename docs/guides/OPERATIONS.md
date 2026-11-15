# Hạ tầng, triển khai và vận hành

## Liên kết bài tập với Phòng tập

Trong CMS, mở **Phòng tập**, chọn một động tác lấy từ Pose Engine và tìm bài tập đang công bố để liên kết. Mỗi động tác có một bài liên kết và mỗi bài liên kết với một động tác. Nút trên thư viện và trang chi tiết mở phòng tập với mã động tác đã chọn. Khi gỡ liên kết, gỡ công bố bài hoặc Pose Engine ngừng hỗ trợ động tác, nút được ẩn khi tải lại trang. CMS vẫn cho gỡ liên kết đã lưu khi Pose Engine gián đoạn.

Catalog sở hữu liên kết trong migration 011. Migration chuyển các ánh xạ mã cũ nếu bài tương ứng đang công bố. Web hỏi danh sách Pose Engine khi mở CMS hoặc bấm **Cập nhật danh sách**, rồi kiểm lại động tác trước khi ghi qua API quản trị Catalog.

Tài liệu thiết kế cho `OPS-001` và `SYS-001`. [Kiến trúc](../design/ARCHITECTURE.md), [database](../design/DATABASE.md), [bảo mật](../design/SECURITY.md) và [test plan](../planning/TEST_PLAN.md) là nguồn chi tiết. Mọi lệnh, artifact và cấu hình thực thi thuộc Development.

## Chatbot Web T27

Đọc [ADR0023](../adr/0023-rag-web-adapter.md) trước bật. Mặc định BFF_RAG_ENABLED=false. Corpus/index bàn giao vẫn rỗng theo audit và user xác nhận chưa có bản mới; không dùng fixture làm corpus, không chạy ingest trong nguồn chỉ đọc. Provider health kb_ready=true chỉ nghĩa KB đã nạp; phải có real generate=true E2E, nguồn được phép, model/corpus version và private ingress đã nghiệm thu trước release. getChatSource full-text chưa có API bàn giao; UI chỉ mở URL gốc đã duyệt và đoạn evidence có giới hạn, không tải toàn văn giả.

Web build/start theo quy trình hiện có, không thêm service/migration: `pnpm --filter @smartgym/web build`, `pnpm --filter @smartgym/web start` (custom server). BFF_AUTH_ENABLED và HTTPS/Identity config vẫn cần cho router hiện tại; khi không có session cookie, knowledge không gọi Identity. Các task cá nhân hoặc resultIDs phải introspect trước đọc raw Pose và kiểm lại trước trả. BFF_POSE_ORIGIN/TLS cấu hình như T24/T25, certificate BFF được phép gọi internal raw endpoint; không cấp credential Pose DB hoặc dùng raw endpoint public.

Bật BFF_RAG_ENABLED=true chỉ ở môi trường được giao; đặt BFF_RAG_ORIGIN là HTTPS origin private ingress, BFF_RAG_TLS_{KEY,CERT,CA}_FILE và BFF_RAG_TOKEN_FILE chứa internal token ≥32 ký tự, không có whitespace. Ingress kiểm certificate caller BFF và token trùng KB_INTERNAL_TOKEN; listener FastAPI gốc tiếp tục ở private network. Không dùng JWT người dùng làm provider token hoặc log secret. BFF_RAG_RUNTIME_REVISION là hash16hex từ bản app bàn giao đã kiểm, phải khớp /health.runtime_revision. Provider hiện tính SHA256 nội dung app.py, knowledge.py, chatbot.py, presentation.py, grounding.py, observation_chat.py nối theo thứ tự đó, lấy16hex đầu. Đối chiếu formula trong source và nguồn bàn giao được chấp thuận; không chép placeholder hoặc nới pin khi mismatch. Lượt này không khởi chạy ingress/provider để giả kb_ready.

BFF_RAG_SOURCES_FILE trỏ JSON registry do operator duyệt: array `{id, rightsStatus:"APPROVED", kind:"BOOK"|"HTML"|"NOTE", allowedOrigins:["https://publisher.example"]}`. ID phải khớp evidence.source_id; không chứa nội dung sách hoặc private path. Chỉ thêm nguồn có căn cứ quyền dùng/attribution theo corpus manifest; không tự gắn APPROVED cho nguồn chưa duyệt. Mặc định có thể [] nhưng mọi response có citation ngoài registry sẽ bị từ chối. Không cho nguồn ex_/catalog: hoặc kind Catalog trước T26; không tự động coi publisher URL là bằng chứng quyền sử dụng. Registry URL origins phải HTTPS, không credential/local/IP. URL response sai origin bị bỏ link; không HTTP fetch hoặc redirect từ server. Registry và secret file được đọc mỗi request; registry quyền nguồn được kiểm lại trước trả câu trả lời, thay đổi giữa chừng chặn citation không còn được duyệt. Runtime pin/origin từ env cần restart/rollout Web theo artifact đã kiểm; token phải xoay đồng bộ ingress secrets.

Hỏi đáp chờ kết quả RAG tới khi hoàn tất hoặc người dùng dừng. Các lượt gọi model có timeout riêng, health và đọc Pose giới hạn 5 giây. Giới hạn body 128 KiB, outbound 8 MiB và response 2 MiB. BFF gửi POST một lần. Hai request mỗi process, một request đang chạy và tối đa năm lượt mỗi phút theo owner hoặc socket IP. Khi dùng Redis, Web gia hạn lease trong lúc chờ RAG và giải phóng khi kết thúc. User có thể dừng chờ ở UI, hành vi hủy inference phía Python cần kiểm riêng ở T29.

Ollama nhận JSON đầu vào dạng gọn và schema bản nháp giữ danh sách mã nguồn hợp lệ. KB RAG tiếp tục dùng chỉ mục, truy xuất nguồn, đối chiếu nguyên văn và bước kiểm tra nội dung từ bản bàn giao.

503 RAG_DISABLED giữ thư viện hoạt động; RAG_NOT_READY yêu cầu corpus/index đúng manifest + restart provider; RAG_RUNTIME_MISMATCH yêu cầu kiểm bản bàn giao, không bỏ pin; RAG_SOURCE_NOT_APPROVED yêu cầu xác minh registry/quyền/namespace; không tự cấp quyền để né lỗi. 504 RAG_TIMEOUT giữ input, không auto retry; HTTP200 status=unavailable là model không khả dụng. 401 xóa transcript/results UI, cần đăng nhập lại. 404/410 kết quả cần chọn lại hoặc phân tích mới, không gửi raw từ browser để thay. 422 NO_RAW_OBSERVATION nghĩa Pose chưa có quan sát raw phù hợp; không bịa dữ liệu. Các error provider/trace/secret/path không chuyển ra client.

Kiểm bằng `pnpm test:chat-bff`, `pnpm check:contracts`, build workspace và `pnpm exec playwright test tests/browser/chat.spec.mjs` khi được phép chạy fixture; bộ dùng provider mTLS giả lập ghi nhãn rõ, Identity/Pose/PostgreSQL/RabbitMQ thật cục bộ. Không nghiệm thu model quality/generation từ bộ này. Theo dõi status/timeouts/429/health failure/in-flight counts theo metadata, không log message/raw/token/citation text. Gate tiếp: corpus/index + model real E2E (knowledge và owner session tasks), rights/source opening, ingress mTLS/quota chung/rotation, Catalog feed T26 và fault/load/operations M6. Chưa triển khai môi trường dùng chung.

## Catalog → RAG producer T36

Phía producer đã kiểm local; đây không phải hướng dẫn khẳng định provider sẵn sàng. Đọc [ADR 0022](../adr/0022-catalog-rag-producer.md), [handoff YAML](../api/catalog-rag-handoff.yaml) và [OpenAPI](../api/openapi.yaml). RAG bàn giao chưa có consumer/ingest Catalog và chưa có corpus/index; user xác nhận chưa có bản bổ sung ngày 2026-11-08. Không chạy ingest trong REFERENCE_ROOT hoặc cấp credential Catalog DB cho RAG.

Build từ WRITE_ROOT bằng `pnpm --filter @smartgym/catalog build`. Sau backup và kiểm môi trường được ủy quyền, nạp DATABASE_URL cho kho Catalog rồi chạy `pnpm --filter @smartgym/catalog migrate` để áp dụng checksum 001–008; không sửa migration cũ. API readiness yêu cầu 008. Chạy `pnpm --filter @smartgym/catalog start` với cấu hình Catalog hiện có. Chưa áp dụng migration lên môi trường dùng chung trong lượt này.

Feed dùng admin HTTPS listener: CATALOG_ADMIN_ENABLED=true, CATALOG_ADMIN_HOST/PORT và CATALOG_ADMIN_TLS_{KEY,CERT,CA}_FILE như CMS. Cấp certificate client riêng cho RAG từ service CA và thêm fingerprint SHA-256 chuẩn hóa vào CATALOG_RAG_FINGERPRINTS (JSON array, mặc định []); không dùng cert BFF hoặc refs. Startup vẫn cần cấu hình Identity hợp lệ cho CMS nhưng mỗi GET feed không gọi Identity/JWKS. RAG gọi GET /internal/v1/catalog/snapshots/head rồi GET /internal/v1/catalog/snapshots/{revision}, không cần JWT end-user. 410 yêu cầu fetch head mới; 503 không được gia hạn freshness. Head chưa bootstrap trả 503; vượt 16 MiB/50.000 mục fail closed, cần thiết kế phân trang/version mới qua ADR, không cắt dữ liệu.

Broker topology chỉ provision bằng tài khoản admin riêng với AMQP_ADMIN_URL/AMQP_CA_FILE: `node scripts/provision-catalog-topology.mjs`. Dùng AMQPS, vhost riêng như các service hiện có. Script khai báo smartgym.events.v1 topic, smartgym.catalog.dlx.v1 direct, quorum smartgym.rag.catalog.v1 và smartgym.rag.catalog.dlq.v1, deadletter key rejected, ba binding published/updated/unpublished. Đây là topology đề xuất, chưa cấp lên provider/staging. Runtime publisher chỉ write exchange smartgym.events.v1 và topic regex ba Catalog keys trong handoff; configure/read rỗng. Consumer dự kiến chỉ read queue chính; quyền provision/replay DLQ thuộc operator, không cấp topology admin cho runtime.

Relay chạy riêng bằng `pnpm --filter @smartgym/catalog relay`, cần DATABASE_URL, CATALOG_AMQP_URL và AMQP_CA_FILE, không cần BFF/Identity/AI credentials. Broker loopback plaintext chỉ dành fixture non-production khi BROKER_ALLOW_LOOPBACK_PLAINTEXT=true; production không bật được ngoại lệ này. Process kiểm migration 008, reconnect khi lỗi; pending lease 30 giây, publish timeout 5 giây và retry backoff 5 giây đến 5 phút. Confirm/mandatory thất bại hoặc DB commit mất sau confirm giữ cùng event ID để phát lại. PUBLISHED chỉ nghĩa broker xác nhận, không nghĩa RAG đã ingest. Invalid contract giữ PENDING/error_code=OUTBOX_CONTRACT_INVALID cho operator; không sửa payload immutable để ép phát, không reset toàn bộ PUBLISHED hoặc sequence.

Theo dõi oldest PENDING/attempts/error_code/expired lease, relay liveness, head 503, snapshot 410/size và queue depth/DLQ. Khi relay dừng, public/CMS tiếp tục, outbox tích lũy; khôi phục broker/ACL rồi khởi động relay và đối chiếu head/consumer watermark. Không xóa PENDING. Snapshot cache dùng kho riêng catalog_feed_snapshots; chưa có purge tự động. Operator có thể xóa obsolete expired, phải loại revision head hiện hành trong cùng transaction/lock publication 73002, không xóa publication history/reason. Tombstone cần publication history ngay cả khi outbox đã được dọn.

Media revoke làm head 503 và snapshot chứa bài liên quan 410; operator gỡ bài hoặc duyệt/publish lại pin hợp lệ. Không làm freshness mới từ head không an toàn hoặc phục vụ cache cũ để né lỗi. Retention 7 ngày không hứa mọi revision cũ đều đọc được: chưa capture/đổi nội dung/thu hồi có thể 410 sớm; current cache dùng được quá TTL. RAG phải thỏa thuận poll 30 giây/stale 60 giây, dedup/max version/atomic index/reconcile tombstone và ngăn citation đang trả từ generation đã gỡ. Chính sách này còn PROPOSED; không bật readiness trước provider ACK và các gate trong YAML.

Kiểm local: `pnpm test:catalog-feed`, `pnpm check:catalog-handoff`, `pnpm check:contracts`; CMS/media regression theo T34/T35. Test chỉ chạy broker probe, không thực thi provider. Khi rollout thật, áp dụng additive 008 trước binary, cấp CA/ACL rồi start API/relay; rollback binary giữ schema 008, dừng/drain relay và phối hợp replay consumer trước khi thay consumer version. Không drop dữ liệu cache/history/outbox như một bước rollback. Container/staging/broker HA/rotation và consumer generation vẫn NOT RUN, giữ cổng T26/T28–30.

## Môi trường và hợp đồng triển khai

| Môi trường | Thiết kế và điều kiện |
|---|---|
| Local | Compose dự kiến có Web và backend theo profile, các logical DB PostgreSQL/roles riêng, RabbitMQ, object storage dev, mail capture và model/test fixtures được phép. Service có lệnh build/test/start độc lập, migration riêng và cấu hình mẫu. Chạy full profile cho M6. |
| CI | Build/test theo path và quan hệ consumer/provider. Pin dependency bằng lockfile. Lint, typecheck, validate OpenAPI/events, unit, integration và security scan. Mỗi service artifact gắn commit, version và digest, có SBOM khi phát hành. E2E dùng artifact đã build. |
| Staging | Namespace/network riêng, TLS, PostgreSQL, RabbitMQ, object store private/public tách, secrets và tài khoản test riêng. Data fixture có nguồn rõ. Gắn model digest, snapshot/index revision và mail sandbox. Nâng, rollback và restore riêng một service bằng artifact version. |
| Production | Đích hosting, vùng dữ liệu, quy mô và provider cần xác nhận ở M6. Ingress công khai cho Web/BFF và luồng được duyệt. Broker, DB và API nội bộ ở mạng riêng. Chỉ mở release sau kiểm tra, duyệt rủi ro và ủy quyền phát hành. |

Mỗi service có danh sách cấu hình và nguồn bí mật, runtime/worker concurrency, dependencies bắt buộc, health/liveness và readiness, cách start/stop và drain. Readiness Catalog chỉ phụ thuộc phần thiết yếu để phục vụ Catalog. AI/model lỗi có trạng thái riêng. Với service không có dữ liệu nguồn, ghi phương pháp dựng lại, ví dụ RAG dùng snapshot kiểm tra hash. Service dùng cùng hạ tầng vẫn khởi chạy độc lập với credential và schema riêng.

## Cổng release và phục hồi

### Kiểm chứng cục bộ trước M6

Docker Compose cục bộ chạy Web, sáu ứng dụng NestJS, Pose Engine Python, RAG và các tiến trình phụ trợ. Các image Node dùng chung lockfile pnpm. Backend build từng ứng dụng bằng Nest CLI và chạy dưới user `node`. Pose Engine và RAG cần tài sản từ nguồn bàn giao và hoạt động trong mạng private. Môi trường đích cần kiểm quyền TLS, quyền từng kho, digest, nâng cấp và rollback cùng cấu hình thật.

Từ root, chạy `docker compose --env-file .env -f infra/compose.yaml build workout pose` để dựng riêng hai image. Compose dùng secret mounts, chạy migration rồi khởi động API. Worker và relay dùng lại image của ứng dụng với entrypoint riêng như `dist/materializer-main.js`, `dist/relay-main.js` hoặc `dist/worker-main.js`. Workout và Pose giữ cổng 3444 và 3443 trên mạng nội bộ.

T50 đã xác minh build image Web, sáu API NestJS và Pose Engine. Sáu API, Pose Engine, worker, relay và materializer đã qua healthcheck cục bộ. Phòng tập và Thư viện trả HTTP 200 ở cổng 3100. Xem [trạng thái kiểm thử T50](../planning/TASKS.md) và [cách khởi động toàn bộ hệ thống](GETTING_STARTED.md).

Để tái lập diễn tập restore Catalog, build package rồi chạy `node --test tests/integration/catalog-restore.test.mjs` với portable PostgreSQL Windows. Runner tạo cluster và role tạm, nạp snapshot local, dừng cluster, sao chép toàn bộ data directory sang backup rồi khởi động bản phục hồi từ bản sao riêng. Phép thử so sánh 35 bài, publication revisions, checksum của 8 migration, kiểm từ chối đăng nhập database khác và gọi API thực sau readiness. Log `.local/finish-catalog-restore.log` ghi 34,539 giây từ lúc bắt đầu dừng cluster đến khi API phục vụ. T29 vẫn cần diễn tập kho đích, chính sách lưu backup, RPO/RTO, kiểm phục hồi object store và đối soát broker. Phạm vi cold copy toàn cluster theo [tài liệu PostgreSQL 18](https://www.postgresql.org/docs/18/backup-file.html).

### Kiểm tra phát hành thư viện T07

Chạy build riêng Web/Catalog, `pnpm check:contracts`, `pnpm check:boundaries`, `pnpm exec playwright test tests/browser/public.spec.mjs` và `node --test tests/system/*.test.mjs`. Test public khởi chạy Web với tài khoản tắt, chỉ cần Catalog/PostgreSQL. `axe-core` kiểm các trang thư viện, tìm kiếm, rỗng, chi tiết và 404. File `.local/public-accessibility.json` giữ cả vi phạm và kết quả cần kiểm thủ công. Bộ test bàn phím có skip link, bản đồ, focus, URL và nội dung chữ khi JavaScript tắt.

Chạy `pnpm test:library-load` để đo bốn truy vấn đọc ở 20 request/giây trong 60 giây. Đặt `LIBRARY_LOAD_SECONDS=600` cho baseline 10 phút ở môi trường đích. Báo cáo `.local/catalog-read-load.json` ghi runtime, CPU, số request, lỗi, lịch phát tải và p50/p95/p99. Lần local 2026-11-07 trên i3-12100F, Node 24.22.1 và PostgreSQL 18.6 đạt 1.200/1.200 request, 0 lỗi, p95 2,89 ms. Số đo áp dụng API loopback, 35 bài và các truy vấn đã nêu trong báo cáo.

T07 chờ phiên kiểm bằng trình đọc màn hình, thao tác trên thiết bị cảm ứng thật và quyết định phát hành nội dung. Snapshot 35 bài hiện có là `development-only`. Ghi thiết bị, trình duyệt, phiên bản trình đọc và kết quả cho Tab, thông báo nhóm đang chọn, đổi mặt, chọn nhóm từ SVG và danh sách, mở bài rồi quay lại. Kiểm cả bàn phím lẫn touch trong viewport hẹp. Vân SVG đã nâng tương phản từ 2,65:1 lên 3,45:1. Báo cáo axe giữ selector của các trường hợp cần kiểm thủ công. Trước phát hành, đối chiếu quyền nội dung/media, origin HTTPS, cấu hình ingress, database role và chạy smoke trên chính artifact ở môi trường đích. [WCAG 2.2 về tương phản thành phần giao diện](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

### Identity T08

Runtime Node.js 24.22.1, package @smartgym/identity 0.1.0. Cấu hình độc lập ở [mẫu](../../backend/apps/identity/.env.example), quyết định ở [ADR 0003](../adr/0003-identity-implementation.md). Build bằng pnpm --filter @smartgym/identity build; migrate và start qua script cùng package. Chạy migrate bằng credential của riêng Identity có quyền DDL; sau đó start bằng credential runtime. Không trỏ IDENTITY_DATABASE_URL về database Catalog. Production phân quyền chi tiết/audit append-only phải kiểm ở T28/T29.

- Khóa ký là RSA PEM >=2048 bit. Hai file delivery/limiter là chuỗi base64url canonical của 32 byte ngẫu nhiên, khác nhau; cung cấp từ secret store, không commit hoặc in log. TLS key/cert/CA là đường dẫn tuyệt đối do deployment cấp. Web origin phải chính xác, issuer HTTPS. Thiếu hoặc sai cấu hình làm startup thất bại, không có HTTP/insecure fallback.
- Client cert hợp lệ theo CA chưa đủ: pin SHA-256 fingerprint cho BFF, Notification và backend cần đọc JWKS. Danh sách nhiều fingerprint cho phép đổi cert. Không dùng test CA/cert ở deployment. Cấp certificate probes để gọi /health/live và /health/ready qua mTLS. Readiness hiện cần schema 002 và DB; liveness chỉ kiểm process. Email/broker lỗi không làm hỏng tài khoản đã có.
- T10 phải cấu hình BFF thay X-SmartGym-Client-IP bằng IP đã xác minh từ ingress, xóa header giả và không tin X-Forwarded-For tùy ý. Identity không bật trust proxy. Cookie Secure luôn bật, không hạ cho HTTP phát hành; HTTPS local/staging để kiểm luồng browser riêng.
- Rotation JWT: thêm public JWK cũ vào IDENTITY_PREVIOUS_JWKS_FILE, đổi private key/kid và triển khai consumer refresh JWKS; giữ khóa cũ tối thiểu thời gian assertion còn sống + clock skew. File cũ cấm trường private/duplicate kid. Không thay delivery key khi còn action hiệu lực; cần cửa sổ drain tối đa 24 giờ hoặc migration keyring riêng trước khi rotation không gián đoạn. Thay limiter key làm reset bucket; phối hợp ingress limiter tại cửa sổ đó.
- Sweeper xóa ciphertext hết hạn mỗi phút; startup scrub trước listen. Theo dõi lỗi cleanup và backlog outbox. T09 đã bổ sung relay process có publisher confirm/consumer dedup. Không tự đánh dấu event đã gửi khi chưa có confirm. Không đọc payload email bằng SQL hay ghi link/token vào log.
- Cấp ADMIN có quyền vận hành riêng: pnpm --filter @smartgym/identity run admin <userId> ADMIN operator. Account phải ACTIVE. Dùng actor UUID thay operator nếu đã có người vận hành định danh. Hạ bằng USER; chặn admin cuối. Mọi thay đổi ghi audit và revoke session; JWT đã phát có thể sống đến 5 phút, BFF phải introspect mới trước admin mutation.
- Dockerfile.identity tạo artifact riêng dự kiến. Docker CLI/tag image/digest và container startup vẫn NOT RUN; phải xác minh trước dùng. Compose hiện chỉ khởi chạy Web/Catalog. Rollout Identity là migrate tương thích → start/cert ACL/ready → smoke auth nội bộ → BFF ở T10; rollback binary chỉ khi schema tương thích, không rollback password hoặc kích hoạt lại token đã dùng.

### Workout plan T13

Tạo database riêng cho Workout và nạp [mẫu cấu hình](../../backend/apps/workout/.env.example). Build `pnpm --filter @smartgym/workout build`, chạy `pnpm --filter @smartgym/workout migrate` bằng role migration, rồi khởi động `pnpm --filter @smartgym/workout start` bằng role runtime. Listener mặc định `127.0.0.1:3444` dùng mTLS. Đăng ký certificate BFF trong `WORKOUT_BFF_FINGERPRINTS`. Readiness/liveness cần certificate BFF được phép làm probe, `/health/ready` kiểm schema Workout và DB.

Đăng ký certificate outbound Workout tại Identity trong `IDENTITY_CALLER_FINGERPRINTS.workout` để đọc JWKS, và trong `CATALOG_REF_FINGERPRINTS` để gọi Catalog refs trên listener mTLS riêng. Cấu hình `WORKOUT_CATALOG_ORIGIN` bằng origin listener đó. Quyền tra refs độc lập quyền CMS. Các operation plan kiểm assertion owner, email đã xác minh và TTL tối đa 5 phút. Cổng BFF và giao diện planner được nối ở T16. [ADR 0013](../adr/0013-workout-plan-implementation.md)

Chạy `pnpm test:workout` trên Windows x64 có binary PostgreSQL kiểm thử. Test tạo role/database Workout riêng và từ chối kết nối tới Catalog. Khi Catalog gián đoạn, vẫn đọc plan và replay create đã thành công. Request tạo mới hoặc sửa cần kiểm Catalog trả 503. T14 đã bổ sung chặn archive khi còn schedule ACTIVE, cùng khóa owner trước khóa plan với thao tác tạo/sửa schedule. Dọn receipt hết 24 giờ định kỳ bằng role của Workout. Container, role runtime giới hạn chi tiết, backup và ingress đích nghiệm thu T28/T29.

### Lịch tập T14

T14 bổ sung migration 002. Artifact hiện tại yêu cầu thêm migration 003 theo mục T15 bên dưới trước khi khởi động. Dừng writer T13 cũ để mọi thao tác archive sau migration kiểm schedule ACTIVE. Role migration cần quyền tạo extension `btree_gist` trong database Workout. Extension được PostgreSQL 18 đánh dấu trusted. Tách quyền DDL khỏi runtime trước cổng triển khai. Giữ checksum migration 001. Kiểm `/health/ready` qua certificate probe sau khi migrate.

T14 thêm API tạo/list/get lịch và list/get occurrence. Tạo lịch ONCE/WEEKLY bằng IANA zone, ngày địa phương, giờ HH:mm và thời lượng 5–240 phút. Khởi tạo tối đa 35 ngày địa phương, bỏ buổi bắt đầu trong quá khứ. Lịch ONCE ngoài cửa sổ có thể chưa có occurrence. T15 đã bổ sung worker tiếp tục mở rộng horizon, chỉnh/hủy và phục hồi theo mục dưới. Khi hai khoảng giờ chồng nhau, API trả 409 với chi tiết buổi đang chiếm giờ, toàn bộ rule/occurrence/outbox mới được rollback. Snapshot bài giữ theo thời điểm tạo lịch. [ADR 0014](../adr/0014-workout-schedule-time.md)

Khởi động relay độc lập bằng `pnpm --filter @smartgym/workout relay`. Đặt `WORKOUT_AMQP_URL` và `AMQP_CA_FILE` theo [mẫu](../../backend/apps/workout/.env.example). Operator tạo durable topic exchange `smartgym.events.v1` và queue/binding cho consumer theo hợp đồng. Cấp publisher Workout quyền write exchange đó và routing key `workout.occurrence.changed.v1`, không cấp quyền configure hoặc đọc queue. Consumer reminders thuộc T19. Nếu chưa có binding, mandatory publish bị trả lại, outbox giữ PENDING và retry với cùng event ID. Relay dùng lease 30 giây, token fencing, confirm timeout 5 giây và backoff 5 giây đến 5 phút. Cờ plaintext chỉ dùng cho loopback thử nghiệm ngoài production. Broker lỗi giữ API lịch hoạt động và không làm mất outbox.

### Chỉnh lịch và materializer T15

Build bằng `pnpm --filter @smartgym/workout build`, dừng writer/worker Workout cũ, áp dụng `pnpm --filter @smartgym/workout migrate` với DATABASE_URL của đúng database Workout rồi khởi động API mới. Artifact hiện tại yêu cầu migration 003, giữ nguyên checksum 001/002. Migration thêm checkpoint/index, không xóa plan, receipt hoặc occurrence. Rollback artifact phải đánh giá khả năng hiểu override và version trước khi mở ghi trở lại, không tự xóa lịch sử migration.

Chạy worker riêng bằng `pnpm --filter @smartgym/workout materialize`, chỉ cần DATABASE_URL của Workout. Không cấp khóa Identity, certificate Catalog hoặc broker credential cho worker này. API, materializer và relay là ba process với quy trình restart riêng. Worker kiểm migration 3 khi khởi động, mỗi batch xử lý tối đa 20 rule, mỗi rule một transaction, kiểm lại mỗi phút. Poll khi rảnh một giây, graceful stop đợi lượt đang xử lý. Hai replica dùng cùng owner lock rồi đọc lại due/status nên không sinh buổi trùng. Worker không gọi mạng ra provider và không đọc database service khác.

PUT lịch và PATCH buổi cần ETag mới nhất. PUT giữ ngoại lệ riêng, DELETE lịch hủy cả buổi đã dời riêng nếu chưa bắt đầu. Buổi quá khứ không đổi. Hủy lặp bằng ETag hiện hành không phát event mới, ETag cũ trả 412. Đọc lại trước khi quyết định thử ghi lại. Snapshot cùng plan được giữ, đổi plan ID chụp snapshot mới cho buổi chịu rule. [ADR 0015](../adr/0015-workout-schedule-reconciliation.md)

Theo dõi `next_projection_at`, `last_projected_at`, `projection_error`, số `schedule_conflicts` và pending outbox. Lỗi ngoài overlap giữ lượt trước, lưu PROJECTION_FAILED và thử sau một phút. Outage DB khiến process retry, sau khi phục hồi worker tính cửa sổ 35 ngày local hiện tại, không bù buổi đã lỡ. Conflict hiện qua API lịch, không có occurrence hoặc reminder, được thử lại mỗi phút và dọn khi ra ngoài cửa sổ. Conflict thay đổi có thể khiến ETag lịch cũ trả 412. Cảnh báo lag/error, kiểm tải, backup/restore và giám sát process đích thuộc T28/T29. Không xóa occurrence hoặc outbox để khắc phục lỗi thực tế.

Kiểm bằng `pnpm test:workout` với PostgreSQL 18.6 và RabbitMQ thật. Bộ test có đồng hồ tiêm qua constructor trong process kiểm thử, production không đọc biến môi trường để thay thời gian. Lượt local T15 đạt 30/30, gồm race dời/hủy, outbox rollback, hai replica, conflict/retry và worker process độc lập. BFF/UI T16, reminder consumer T19 và container/môi trường đích chưa thuộc nghiệm thu này.

### Workout Planner T16

Sau khi build/migrate/start Workout theo T13–T15, cấu hình HTTPS Web và Identity theo T10. Bổ sung `BFF_WORKOUT_ORIGIN` là origin HTTPS chính xác của Workout, `BFF_WORKOUT_KEY_FILE`, `BFF_WORKOUT_CERT_FILE`, `BFF_WORKOUT_CA_FILE` trong [mẫu Web](../../frontend/.env.example). Certificate client Web phải có fingerprint trong WORKOUT_BFF_FINGERPRINTS. Không dùng credential Catalog CMS thay quyền owner Workout. Node server không tự nạp .env, dùng shell/secret manager của môi trường.

Mở `/app/chuong-trinh` để tạo/sửa/lưu trữ chương trình và `/app/lich` để tạo lịch ONCE/WEEKLY, xem agenda/tuần, sửa quy tắc hoặc mở chi tiết để dời/hủy riêng. `/app` có liên kết tới hai vùng này. Hiển thị giờ kèm IANA zone, thay zone xem không sửa giờ gốc. Ngày bắt đầu và zone xem giữ trong URL. Picker dùng GET Catalog public qua cùng origin, cấu hình CATALOG_URL như thư viện hiện có, không cần Workout/Identity assertion cho nội dung công khai.

Chạy `pnpm test:workout-bff` cho boundary/format thời gian và `pnpm test:workout-ui` cho build và Chromium tích hợp cục bộ. Workout browser fixture có database/role riêng, API process riêng và mTLS thật, Identity/email dùng PostgreSQL/RabbitMQ/SMTP sandbox. Khi cần hồi quy đầy đủ auth/CMS, bật CMS_TEST_TOOLS=true và chạy `pnpm exec playwright test tests/browser/auth.spec.mjs tests/browser/workout.spec.mjs`. Không dùng CA hoặc tài khoản fixture ở triển khai thật. Artifact ảnh kiểm thử nằm trong `.local/browser-results` và bị ignore.

Khi gặp 409, đổi ngày/giờ theo chi tiết xung đột. Với 412, giữ draft và chỉ tải phiên bản mới sau xác nhận. Với 401, đăng nhập lại ở tab mới và chủ động thử lưu, không tự retry command. Không xóa database hoặc migration để xử lý xung đột. Materializer có thể cập nhật conflict, dùng Cập nhật lịch để đọc lại. BFF không giữ shared cache cho dữ liệu riêng và không lưu token/draft vào browser storage. Khi Workout lỗi, thư viện vẫn phục vụ qua Catalog. Nhật ký/summary T17/T18 và nhắc lịch T19/T20 còn tiêu chí riêng. [ADR 0016](../adr/0016-workout-planner-bff.md)

### Nhập Pose vào Progress T25

Đọc [ADR 0021](../adr/0021-pose-progress-import.md). Không có migration mới; Progress vẫn schema 001. Bật client bằng `PROGRESS_POSE_ORIGIN` HTTPS origin và ba file `PROGRESS_POSE_TLS_KEY_FILE`, `PROGRESS_POSE_TLS_CERT_FILE`, `PROGRESS_POSE_TLS_CA_FILE`. Certificate này phải nằm trong `POSE_PROGRESS_FINGERPRINTS` tại Pose; certificate BFF chỉ có quyền public result của owner, không thay certificate Progress. Pose xác minh assertion Identity cùng issuer/audience đang dùng ở các service. Không cấp DB/object/engine credential Pose cho Progress.

Thiếu origin thì import mới trả 503 POSE_UNAVAILABLE; các log/summary hiện có vẫn chạy và readiness của Progress không phụ thuộc Pose. Nếu đã khai báo origin nhưng sai TLS/cấu hình thì startup fail, không hạ HTTPS. GET summary deadline 3 giây/cap 256 KiB, kiểm no-store/content type/schema/result ID; không theo redirect hoặc retry ngầm. Người dùng chỉ gửi ID, thời điểm tùy chọn và occurrence tùy chọn. Runtime Pose thực phải lưu result hoàn tất còn hạn. Không đọc file raw để chữa lỗi import.

Web dùng BFF Progress hiện có cho POST `/api/v1/progress/pose-imports`; reader kết quả Pose dùng `BFF_POSE_ORIGIN` và `BFF_POSE_TLS_*_FILE` hiện có. Origin cho phép đọc result qua mTLS/owner; live/upload vẫn cần flags/origin tương ứng, không bật camera/inference chỉ vì cấu hình reader. Trang `/app/tap-ai/ket-qua/{id}` và màn hình kết thúc có xác nhận lưu. Trường thời điểm mặc định completedAt; khi không sửa, UI bỏ performedAt để server giữ chính xác timestamp thay vì làm tròn phút. Picker buổi chỉ lấy phạm vi ±7 ngày quanh kết quả, có tải thêm; nếu cần liên kết buổi ngoài phạm vi này, gọi API qua client nghiệp vụ có hợp đồng phù hợp, không chỉnh DB bỏ qua ownership.

`NO_LOGGABLE_RESULT` là nhánh nghiệp vụ cho count chưa có hoặc 0, không phải lỗi engine: hiển thị phân tích rồi ghi thủ công, không điền rep/duration giả. Một import count dương thành một set gộp, không suy ra trọng lượng hay set boundaries. Snapshot AI gốc được giữ riêng với actual sets người dùng chỉnh sau đó, không được sửa thông qua PUT log.

Khi mất phản hồi POST, giữ key/body và thử lại chủ động: cùng receipt còn hạn trả log đầu tiên, không tự tạo key mới để né lỗi. Khác key cùng source trả 409 và link log nếu còn; sau xóa source vẫn reserved, cùng key còn hạn 410 LOG_DELETED. Xóa hoặc expiry Pose không xóa log đã nhập; duplicate/replay được kiểm trước call Pose nên vẫn mở log khi Pose ngắt. Phải kiểm quyền hiện tại trước replay. Không xóa receipt/unique reservation thủ công để tạo nhật ký thứ hai.

Chạy `pnpm test:pose-import` để build workspace và kiểm Web/BFF/Progress/Pose/Catalog/Workout/Identity bằng database riêng, RabbitMQ/SMTP loopback. `pnpm test:pose-import-ui` build + BFF + Chromium. Test helper `pose-summary.mjs` lưu fixture result cuối có nhãn rõ, không chạy ONNX hoặc đọc video; không coi các test này là nghiệm thu chất lượng AI mới. Các ca T21–T24 giữ bằng chứng engine thật, staging/provider/TLS đích, tải/restore và quyền dữ liệu vẫn thuộc cổng sau.

### Nhật ký Progress T17

T25 bổ sung nhập kết quả AI, giữ schema 001 và các quy tắc log cũ; cấu hình và nghiệm thu ở [runbook T25](#nhập-pose-vào-progress-t25).

`@smartgym/progress` 0.1.0 có cấu hình tại [mẫu riêng](../../backend/apps/progress/.env.example). Cấp database/role chỉ cho Progress, từ chối kết nối database Catalog/Workout/Identity. Dùng credential migration riêng khi vận hành. Cấu hình DATABASE_URL trỏ đúng kho Progress và TLS key/cert/CA của API. Mặc định bind 127.0.0.1:3445, chỉ mở qua mạng service riêng trong môi trường đích.

Cấp certificate client của Progress vào caller `progress` trong IDENTITY_CALLER_FINGERPRINTS để đọc JWKS. Thêm fingerprint phù hợp vào CATALOG_REF_FINGERPRINTS và WORKOUT_PROGRESS_FINGERPRINTS. Workout vẫn giữ WORKOUT_BFF_FINGERPRINTS tách riêng. Certificate Progress chỉ đọc `/internal/v1/workout/occurrences/{id}` kèm JWT principal, không sửa kế hoạch/lịch. BFF certificate không được gọi endpoint nội bộ đó. Cấu hình PROGRESS_BFF_FINGERPRINTS cho API Progress. Không cấp khóa ký Identity hoặc credential DB service khác cho Progress.

Thứ tự chạy: `pnpm --filter @smartgym/progress build`, `pnpm --filter @smartgym/progress migrate`, sau đó `pnpm --filter @smartgym/progress start`. Startup/readiness yêu cầu migration 1 và DB, không gọi Catalog/Workout để báo ready. Liveness chỉ kiểm process. Certificate probe lấy từ allowlist BFF. Catalog/Workout cần sẵn sàng cho thao tác mới phụ thuộc nguồn, đọc log cũ/replay và sửa set đã có có thể tiếp tục khi nguồn lỗi. Mỗi request vẫn cần xác thực Identity.

Kiểm riêng bằng `pnpm --filter @smartgym/progress test` hoặc `pnpm test:progress`. Runner build dependencies kiểm thử rồi tạo PostgreSQL, database/role, TLS và API processes riêng, không cần chạy service production hoặc đăng nhập thật của người dùng. Không dùng CA/certificate fixture tại môi trường đích. Lượt T17 đạt 13/13 trên PostgreSQL 18.6, hồi quy Workout 30/30 với RabbitMQ 4.4.0. Dockerfile.progress là cấu hình artifact, Docker CLI hiện không có nên build/tag/digest NOT RUN. Không coi local process test là nghiệm thu container/staging.

POST log cần Idempotency-Key, PUT/DELETE cần If-Match. Input set không nhận exerciseNameVi, output trả tên snapshot chỉ đọc. Cặp exerciseId/ordinal duy nhất, rep/thời lượng có ít nhất một, trọng lượng kg hữu hạn 0–1000. PerformedAt là thời điểm thực tế không ở tương lai, chuẩn hóa UTC millisecond. List dùng from/to nửa mở `[from,to)`, lọc exerciseId và cursor gắn owner/filter/limit. Lịch đã hủy hoặc bắt đầu sớm vẫn có thể ghi thực tế theo [ADR 0017](../adr/0017-progress-log-ownership.md).

409 OCCURRENCE_ALREADY_LOGGED ngăn liên kết buổi lần thứ hai, detail chỉ trỏ log của chính owner nếu còn tồn tại. 412 cần đọc lại trước khi sửa, không tự ghi đè. Receipt hết hạn có thể dọn theo expires_at bằng role Progress. Sau DELETE, bỏ payload set/notes/snapshot/receipt và giữ tombstone nguồn. Replay còn hạn trả 410 LOG_DELETED, key khác hoặc hết hạn vẫn không tạo log mới cho occurrence đã dùng. Không xóa tombstone để sửa lỗi trùng. Xóa dữ liệu tài khoản/backup theo chính sách T28/T29.

Khi nâng cấp, giữ checksum SQL đã áp dụng, backup kho Progress và kiểm tương thích schema/API trước rollback. Chỉ rollback binary tương thích, không xóa migration tự động. BFF/UI/summary ở T18 và import Pose ở T25. Không đưa JWT hoặc thông tin nội bộ các kho vào browser để gọi trực tiếp backend.

### Nhật ký và tiến độ Web T18

Không có migration mới sau T17. Build/start Progress với schema 1, cập nhật Web/BFF rồi cấu hình BFF_PROGRESS_ORIGIN, BFF_PROGRESS_KEY_FILE, BFF_PROGRESS_CERT_FILE, BFF_PROGRESS_CA_FILE theo [mẫu Web](../../frontend/.env.example). Origin là HTTPS chính xác, certificate client của Web có trong PROGRESS_BFF_FINGERPRINTS. Giữ cấu hình Identity và Workout riêng như T10/T16/T17. Server không tự nạp .env và không gửi JWT/credential backend cho browser.

Mở `/app/nhat-ky` để xem/lọc nhật ký, `/app/nhat-ky/moi` để nhập set thực tế hoặc dùng liên kết từ chi tiết buổi tập. `/app/nhat-ky/[id]` sửa/xóa theo ETag. `/app/tien-do` hiển thị tổng buổi, rep, rep × kg, SVG số buổi và bảng cùng dữ liệu. `/app` tải profile và ba vùng summary/recent log/upcoming riêng. Widget thông báo/inbox tiếp tục ở T20, không giả số chưa đọc.

Summary from/to là ngày local bao gồm hai đầu, timeZone IANA, tối đa 366 ngày. Khoảng UTC lấy đầu ngày đầu tới đầu ngày sau ngày cuối. Series có mọi ngày kể cả 0. Chỉ tính log chưa xóa, không đếm số set thành số buổi, không chuyển thời lượng thành rep và không cộng kg thiếu rep. Numeric SQL giữ độ chính xác trước khi trả JSON. Không có cache hoặc job tổng hợp cần chạy. Khi runtime/PG tzdata đổi, kiểm lại các vùng đích và DST.

Chạy `pnpm test:progress` cho backend, `pnpm test:progress-bff` cho biên TLS/schema và `pnpm test:progress-ui` cho build/BFF/Chromium. Hồi quy vùng cũ bằng CMS_TEST_TOOLS=true và `pnpm exec playwright test tests/browser/auth.spec.mjs tests/browser/workout.spec.mjs`. Browser fixture tùy chọn progress:true tạo database/role/API Progress và Workout riêng, auth/email/Catalog dùng PostgreSQL/RabbitMQ/SMTP sandbox. Cờ này không đổi mặc định fixture hiện có.

Với duplicate occurrence, UI mở link log đã có của owner, không tạo log thứ hai. 410 là lần gửi cũ trỏ tới log đã xóa. 412 giữ draft và yêu cầu tải bản mới có xác nhận. Khi một nguồn lỗi, thử lại đúng vùng lỗi, không reset phiên hoặc xóa dữ liệu. BFF không tự retry command. Ảnh QA tại `.local/ui-review/`, log test ở `.local`, không dùng làm nội dung phát hành.

T18 không xác lập kiểm thử tải hoặc toàn bộ WCAG, không có container/staging mới đã nghiệm thu. Giữ cổng T07, T28/T29, nhắc lịch T19/T20 và nhập Pose T25. [ADR 0018](../adr/0018-progress-summary-ui.md)

### Notification email T09

Đọc [ADR 0004](../adr/0004-transactional-email.md) và [mẫu cấu hình](../../backend/apps/notification/.env.example). Hai process thuộc hai service sở hữu dữ liệu độc lập: Identity relay chỉ dùng database Identity; Notification consumer/worker chỉ dùng database Notification và HTTP mTLS resolveEmailDelivery. Không cần private signing/delivery key của Identity ở Notification. Node 24.22.1, package @smartgym/notification 0.1.0; port mặc định 3003 HTTPS/mTLS, chỉ có health endpoints tại T09.

Trình tự hiện hành: cấp DB/credentials/TLS và SMTP sandbox → pnpm --filter @smartgym/identity run migrate (đến 003), pnpm --filter @smartgym/notification run migrate (đến 002 từ T19) → provision cả topology email/nhắc lịch → khởi chạy Identity API → Notification → Identity relay. Build từng package bằng script build riêng. Relay chạy pnpm --filter @smartgym/identity run relay; Notification chạy pnpm --filter @smartgym/notification start. Không tự migrate khi start. Runtime DB role tối thiểu/audit ACL cần cổng T28/T29; test đã dùng owner role không superuser và từ chối DB chéo. Xem thêm [nâng cấp T19](#nhắc-lịch-notification-t19).

- Provision topology email với AMQP_ADMIN_URL, AMQP_CA_FILE nếu CA riêng, rồi node scripts/provision-email-topology.mjs; thêm topology nhắc theo T19. Admin giữ quyền configure, runtime không có. Exchange/queue/DLX tên chuẩn theo API_CONTRACTS. Broker 4.4.0 cho phép passive check với write/read permission tương ứng, không cần configure. Identity publisher chỉ write exchange và topic identity.email-action.requested.v1; Notification consumer chỉ read hai queue email/workout được công bố, không publish hoặc đọc DLQ. Topic ACL/broker definitions thuộc credential provisioning, không suy ra từ appId header.
- AMQP dùng amqps và CA hợp lệ; SMTP secure=true (TLS trực tiếp) hoặc STARTTLS bắt buộc với verify peer. Hai cờ plaintext chỉ cho loopback ngoài production. File client certificate Notification phải được allowlist tại Identity; server health certificate và client certificate có mục đích riêng. Probe certificate được pin trong NOTIFICATION_PROBE_FINGERPRINTS. Không public /internal/ hay cổng broker/database.
- Readiness Notification cần migration và consumer broker đang hoạt động; liveness không chờ broker. SMTP outage không làm mất job, trạng thái retry/failed/unknown nằm ở DB. Theo dõi pending-age, attempts, UNKNOWN, FAILED, DLQ và outbox backlog; tích hợp metrics/alert đầy đủ ở T29. Resolve Identity có deadline tuyệt đối/inactivity 5 giây; SMTP connect/greeting/socket timeout 5 giây. Lease worker 60 giây, relay 30 giây; kiểm clock UTC đồng bộ khi triển khai nhiều replica.
- RETRY tối đa 5 attempts, backoff 5s/30s/2m/10m và không gửi action hết hạn. 410 từ Identity hủy job; 404/401/403 terminal cần kiểm nguồn/config/ACL. Broker lỗi giữ outbox PENDING và reconnect; ACK sau commit inbox/job. Schema JSON sinh từ docs bằng sync-notification-contract, kiểm stale trong check:contracts. Raw email/link/token không lưu trong job, attempt hoặc log.
- UNKNOWN không tự replay: tra receipt provider theo Message-ID ổn định, lập case không chứa thông tin nhạy cảm trong DB, rồi pnpm --filter @smartgym/notification run resolve <jobId> CONFIRMED_SENT OP-actor CASE-ref hoặc CONFIRMED_NOT_SENT nếu có bằng chứng chưa nhận. Lệnh cần quyền vận hành DB riêng và ghi delivery_resolutions. Nếu chưa rõ, giữ UNKNOWN; người dùng yêu cầu link mới theo rate limit. SMTP 250 là accept chuyển tiếp, không xác nhận inbox/deliverability.
- DLQ là hàng đợi riêng cho poison/conflict, chỉ operator đọc. Xác định schema/producer và sửa nguyên nhân trước replay, giữ event ID và nội dung nếu retry hợp lệ. Không biến DLQ thành cơ chế tự gửi lại UNKNOWN. ACK thất lạc hoặc confirm mất có thể redeliver nhưng inbox/job unique ngăn gửi logic trùng. Runbook không tự sửa payload cũ để né dedup.
- Test local: scripts/prepare-broker-tools.mjs tải/kiểm SHA-256 OTP 28.5.0.7 và RabbitMQ 4.4.0, pnpm test:email chạy loopback với cổng/node/EPMD/cookie/data riêng. Certificate/SMTP messages chỉ dùng test, không cài hệ thống. Runner đóng process và dọn data; binary archives được giữ .local để tái sử dụng, không commit. SMTP thật/provider domain/DKIM/SPF/DMARC, container/image digest, broker HA/restore, TLS AMQP/SMTP thật và production rollout cần staging/T28–T29. Dockerfile.notification chưa build do thiếu CLI; Compose hiện chỉ Web/Catalog.

### Nhắc lịch Notification T19

Đọc [ADR 0019](../adr/0019-notification-reminders.md). Build Notification độc lập bằng `pnpm --filter @smartgym/notification build`, chạy migration đến **002**, giữ nguyên migration/checksum 001. Dừng/drain worker T09 trước khi nâng schema và worker cùng đợt; binary T09 dùng ON CONFLICT cũ không tương thích partial index mới. Không rollback binary cũ khi chưa có phương án schema tương thích được kiểm. Backup/restore và container rollout thực thuộc T28/T29.

1. Giữ topology email T09. Với credential quản trị broker và `AMQP_ADMIN_URL`/`AMQP_CA_FILE`, chạy `node scripts/provision-reminder-topology.mjs`. Không đưa admin credential vào process runtime.
2. Cấp Notification read đúng `smartgym.notification.email.v1` và `smartgym.notification.workout.v1`; configure/write là `^$`, không đọc DLQ. Giữ Workout publisher chỉ write `smartgym.events.v1` với topic `workout.occurrence.changed.v1`. Queue/DLQ đều quorum, DLX `smartgym.workout.dlx.v1`, routing key dead-letter `rejected`. Cổng T28 xác minh delivery-limit, DLQ durability khi broker lỗi, HA và TLS thực.
3. Khởi chạy Identity API, Notification (`pnpm --filter @smartgym/notification start`) và Workout relay theo runbook T14. Notification không cần quyền DB/khóa ký Identity hoặc DB Workout. Dùng cấu hình hiện có, thêm quyền consume queue mới; không thêm secret/config công nghệ mới. HTTPS health probe cần certificate allowlist. Ready cần schema 002, DB và hai consumer; live chỉ cần process.
4. Mặc định nhắc in-app trước 60 phút, email nhắc tắt. T19 đã có bảng và thao tác nội bộ; thay preference của người dùng qua API/UI phải chờ T20, không hướng dẫn sửa trực tiếp DB để bỏ qua version/điều phối. Thông báo đã tạo giữ lịch sử khi đổi lịch; nội dung có giờ/zone lúc gửi và link occurrence hiện hành. Không có endpoint inbox public ở T19.

Mỗi replica chạy hai consumer và hai worker, vòng rỗng nghỉ một giây. Claim tối đa một job mỗi worker mỗi tick; DB candidate batch 20, recover batch 100. Lease 60 giây, SMTP/Identity deadline 5 giây, tối đa 5 attempts. Owner lock trước row lock, token fencing khi recheck/finish; đồng bộ clock UTC giữa replica. Không dựa vào broker readiness để xóa jobs hoặc dừng scheduler đã có projection. Nếu broker ngắt, ready 503, jobs bền vẫn xử lý và chấp nhận cửa sổ projection cũ; Identity và Catalog tiếp tục độc lập.

Khi dời/hủy, kiểm outbox lag → queue lag → occurrence_projection.version → source_version/status của jobs. Không phát event mới để ép bản thấp hơn thắng tombstone. Poison/hash/version conflict vào DLQ, chỉ replay cùng ID/payload sau xử lý nguyên nhân. Lỗi DB đóng consumer, redelivery sau reconnect; không ACK sớm. Retry SMTP áp dụng backoff 5s/30s/2m/10m; đến giờ bắt đầu thì bỏ nhắc. UNKNOWN không tự retry: dùng quy trình CLI/case evidence T09, sau đối soát worker vẫn kiểm lại version/preferences/deadline. Đổi opt-out sau SENDING hoặc cancel chưa tới Notification không bảo đảm chặn thư; giữ SENT/UNKNOWN đúng bằng chứng, không tự báo CANCELED cho thư đã dispatch. Không purge inbox/projection/tombstone khi chưa chốt cửa sổ replay/retention.

Chạy `pnpm test:reminders` với portable PostgreSQL/RabbitMQ đã chuẩn bị, SMTP TCP sandbox, test CA mTLS tạm và role/database riêng. `pnpm test:email` giữ hồi quy xác minh/reset; fixture email cũng provision queue nhắc để health phù hợp binary hiện hành. Không gửi email Internet. Docker CLI/container, provider domain/DKIM/SPF, AMQPS/SMTPS thật, throughput/SLO và cảnh báo còn NOT RUN tại môi trường đích.

### Hộp thông báo và preferences T20

Không có migration mới: Notification vẫn cần schema 002 và hai topology T19. Bật owner API bằng `NOTIFICATION_API_ENABLED=true`, cấp `NOTIFICATION_BFF_FINGERPRINTS` là JSON array fingerprint SHA-256 của BFF và `NOTIFICATION_IDENTITY_ISSUER` khớp chính xác issuer đang ký JWT. Dùng `NOTIFICATION_IDENTITY_ORIGIN` và certificate Notification hiện có để đọc JWKS qua mTLS. Thiếu/sai cấu hình khi bật API làm startup thất bại; khi API tắt chỉ có health/worker T19, route inbox/preferences không tồn tại. Không thay allowlist bằng header client tự khai.

Web cần `BFF_NOTIFICATION_ORIGIN` là HTTPS origin không path/query và `BFF_NOTIFICATION_KEY_FILE`, `BFF_NOTIFICATION_CERT_FILE`, `BFF_NOTIFICATION_CA_FILE`. BFF cert phải nằm trong allowlist Notification. Không cấp khóa ký hoặc database credential Notification cho Web. Build riêng bằng script build của hai package, chạy Notification theo T19 và Web theo T10; image/container/TLS ingress môi trường đích vẫn thuộc T28/T29. API bật không yêu cầu mở port backend ra Internet.

Sau đăng nhập, mở `/app/thong-bao` hoặc `/app/cai-dat/thong-bao`. Dashboard badge lấy unreadCount thật; filter tất cả/chưa đọc và read button không tác động email. Preferences mặc định app=true/email=false/lead=60, chỉnh bằng If-Match để owner lock/version/replan jobs đúng T19. Không thay trực tiếp bảng bằng SQL để xử lý conflict. Khi 412, UI giữ draft; chỉ tải bản server sau xác nhận. Nếu PUT timeout/mạng đứt, chưa biết commit hay chưa: tải cấu hình server đối chiếu, không tự gửi lại với ETag mới. Read PUT có thể lặp an toàn, timestamp không đổi.

Inbox refresh 30 giây khi tab hiện và khi focus/visibility, hủy request lúc unmount; không polling form đang sửa. Refresh lỗi giữ mục cũ kèm cảnh báo; 401 xóa dữ liệu inbox đang hiển thị và mời đăng nhập lại ở tab mới. Preference draft chỉ giữ trong bộ nhớ tab, không localStorage. Thông báo đã gửi không sửa lịch sử khi dời/hủy; link mở trạng thái hiện tại. Mất broker làm ready=503 nhưng inbox/preferences trên DB còn hoạt động; mất Identity khiến xác thực API thất bại đóng, public Catalog tiếp tục hoạt động.

Kiểm `pnpm test:notifications` (PostgreSQL/Identity mTLS), `pnpm test:notifications-bff` (TLS upstream fixtures có tên rõ), `pnpm test:notifications-ui` (build + BFF + Chromium, portable PG/Rabbit/SMTP đã chuẩn bị). Test helper chỉ bật Notification API khi option notifications=true; bộ auth/CMS cũ dùng mặc định giữ nguyên. `pnpm test:reminders` và `pnpm test:email` giữ kiểm thư sandbox/queue/projection, không dùng địa chỉ thật. Cổng kiểm thủ công assistive technology/thiết bị, provider/TLS thật, tải/cảnh báo và backup/restore vẫn chưa được thay bằng axe hoặc test local.

### Web auth T10

Bản demo đồ án dùng tối thiểu 8 ký tự khi đăng ký và đặt lại mật khẩu. Để thử email/password với dữ liệu tạm, chạy `node scripts/dev-auth.mjs` từ root sau khi build và chuẩn bị broker. Runner cấp một tài khoản đã xác minh và in URL HTTPS cùng thông tin đăng nhập demo. Trình duyệt cần tin cậy CA thử nghiệm của phiên. Dừng runner bằng Ctrl+C để dọn dữ liệu.

Web dùng Auth.js Credentials cho đăng nhập mật khẩu và NextAuth.js client cho Google. Identity giữ tài khoản, phân quyền và phiên SmartGym. Web cần `AUTH_SECRET` hoặc `BFF_AUTHJS_SECRET_FILE`. Chuẩn bị Docker Compose sẽ tạo `.local/compose/web/authjs-secret` nếu file chưa có. Các bản sao của Web trong cùng môi trường phải dùng chung secret.

Đăng nhập Google cần Identity migration 003 và OAuth Client loại Web. Đặt `BFF_GOOGLE_CLIENT_ID` và `BFF_GOOGLE_CLIENT_SECRET_FILE` ở tiến trình Web. Trong **Authorized redirect URIs** của Google Cloud, thêm chính xác `<BFF_WEB_ORIGIN>/api/auth/callback/google`. Docker mặc định dùng `https://127.0.0.1:3100/api/auth/callback/google`. Với runner demo, dùng `SMARTGYM_AUTH_DEMO_PORT=3448` để đăng ký URL cố định `https://127.0.0.1:3448/api/auth/callback/google`. Nếu consent screen ở Testing, thêm tài khoản Google thử nghiệm. Auth.js xử lý giao thức OIDC. Web kiểm tra chữ ký ID token và quyền của Google đối với email trước khi gọi Identity qua mTLS. Identity nhận diện theo Google subject. Nếu Google xác thực cùng địa chỉ của tài khoản SmartGym đang hoạt động và đã xác minh, Identity liên kết Google trong lần đăng nhập đầu tiên. Tài khoản giữ nguyên ID, dữ liệu, quyền và cách đăng nhập bằng mật khẩu. [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)

Khởi chạy Web bằng pnpm --filter @smartgym/web start (node server.mjs), build vẫn Next build. [Cấu hình](../../frontend/.env.example), [ADR 0005](../adr/0005-web-auth-bff.md). Mặc định BFF_AUTH_ENABLED=false phục vụ Catalog HTTP local; bật auth cần BFF_WEB_ORIGIN HTTPS chính xác, Web server key/cert và BFF client key/cert/Identity CA. BFF certificate phải nằm trong allowlist bff ở Identity. Identity web origin phải bằng BFF web origin. Thiếu/sai TLS khi bật auth khiến startup thất bại, không fallback sang HTTP cho credentials.

- Node server lấy socket.remoteAddress, không tin X-Forwarded-For, X-SmartGym-Client-IP hoặc header user/role từ client. T10 hỗ trợ TLS trực tiếp; không đặt proxy kết thúc TLS trước Node rồi tin IP header tùy ý. Muốn dùng ingress khác phải thiết kế lại peer trust/certificate và kiểm rate-limit isolation trước rollout. Không hỗ trợ Next standalone/serverless ở cấu hình custom server hiện tại.
- API auth chỉ method/path trong OpenAPI, cùng origin, CSRF header=1, JSON <=16 KiB và timeout đọc 5 giây. HTTP Identity mTLS deadline 5 giây, response cap 32 KiB và validate schema, sanitize Problem. Không forward JWT, redirect, cookie tùy ý hoặc raw upstream error. Chỉ Set-Cookie chính xác từ login/reset/logout thành công. Browser cookie Secure/HttpOnly/SameSite=Lax/Path=/ và không Domain; auth qua HTTPS local/staging.
- Auth/private pages force-dynamic, no-store/no-referrer/noindex. Không thêm analytics bên thứ ba lên verify/reset. Token ở fragment, chỉ xử lý explicit POST; không dùng query token. SSR không cache role/profile. /admin của T10 mới là access gate; T11/T12 mới cung cấp CMS thực. Không seed ADMIN hoặc bí mật mặc định.
- Chạy test:bff cho policy/transport fixtures, test:browser cho HTTPS Chromium cùng broker/SMTP/DB thật cục bộ và public regression. Test CA chỉ tin trong context Chromium hoặc Node request fixture, không cài OS CA hay bỏ verify upstream TLS. Auth traces tắt để tránh lưu action fragment; ảnh chỉ dùng tài khoản test tổng hợp. Cần runtime portable từ prepare-broker-tools.mjs trước test auth.

### Catalog Admin T11

Chạy `pnpm --filter @smartgym/catalog run migrate` để áp dụng các migration chưa chạy trước khi khởi động binary mới. Catalog public giữ port 3001 theo mặc định. Khi bật `CATALOG_ADMIN_ENABLED=true`, listener mTLS mặc định bind loopback port 3101. Cấu hình certificate server, CA và fingerprint BFF. Cấp certificate client riêng cho Catalog và đăng ký fingerprint `catalog` ở Identity để đọc JWKS. `CATALOG_IDENTITY_ISSUER` phải khớp issuer của assertion. Giữ listener admin trên mạng riêng. [Mẫu cấu hình](../../backend/apps/catalog/.env.example)

Kiểm tra `/health/ready` trên listener public và chạy `pnpm test:catalog-admin` trên Windows x64 để nghiệm thu với PostgreSQL tạm. Khi Identity gián đoạn, Catalog public vẫn đọc từ database. Theo dõi lỗi 503 trên admin và trạng thái outbox PENDING. Relay Catalog thuộc T36. Trước release, cấp role runtime không có quyền sửa trigger audit và lập lịch dọn `idempotency_keys` hết hạn. [ADR 0006](../adr/0006-catalog-exercise-publication.md)

### Admin Dashboard T12

Chạy Catalog với listener admin T11 và Web ở chế độ HTTPS như T10. Nạp `BFF_CATALOG_ADMIN_ORIGIN` và bộ key, cert, CA của đường Web → Catalog theo mẫu. Certificate của BFF phải nằm trong allowlist Catalog. Origin trỏ tới cổng mTLS riêng. Mỗi request admin kiểm Identity trước khi chuyển tiếp. Nếu Identity gián đoạn, cổng trang admin trả 503. Nếu listener admin của Catalog gián đoạn, dashboard báo lỗi và có nút thử lại. Thư viện tiếp tục đọc qua listener public khi listener này còn hoạt động. Kiểm thử bằng `pnpm test:browser`. [Mẫu cấu hình Web](../../frontend/.env.example)

### Thư viện công khai T06

Sau khi có tên miền phát hành, đặt `WEB_PUBLIC_ORIGIN` bằng HTTPS origin của Web. Canonical, Open Graph và `/sitemap.xml` dùng origin này. Khi thiếu origin hợp lệ, Web giữ `noindex` cho trang thư viện và bài tập, và sitemap trả 404. Sitemap đọc bài đang công bố trực tiếp từ Catalog, dùng `no-store`, và trả 503 nếu Catalog lỗi hoặc hết thời gian đọc.

Đặt `WEB_CATALOG_MEDIA_ORIGIN` bằng chính HTTPS origin của `CATALOG_MEDIA_PUBLIC_ORIGIN` và chuyển `/api/v1/media/<id>/<version>` tại origin đó tới Catalog public. Web chỉ trình bày đường dẫn gateway được phép. Bucket S3 vẫn private. Giữ byte-range và `Cache-Control: no-store` qua ingress để video phát được và quyền thu hồi có hiệu lực ở lần đọc tiếp theo. Test loopback có thể dùng HTTP `127.0.0.1`. Khi media thiếu hoặc lỗi, trang chi tiết giữ hướng dẫn bằng chữ. [Mẫu cấu hình Web](../../frontend/.env.example) · [Gateway Catalog](#media-catalog-t33)

### Admin CMS T35

Trong `/admin`, quản trị viên mở nhóm cơ, dụng cụ, biến thể hoặc media từ thanh điều hướng. Mỗi editor có lịch sử, so sánh hai phiên bản trên cùng trang và khôi phục thành nháp. Khi nhận 412, giữ form và chỉ tải lại nếu người dùng chọn bỏ phần đang nhập. Tra cứu `/admin/nhat-ky` theo người thực hiện, loại, mã nội dung và khoảng ngày UTC. `/admin/nhap-xuat` kiểm gói KB đã đăng ký, áp dụng vào nháp và tải bản xuất công khai theo revision. Dùng phiên bản registry mới nếu bộ bản nháp đã đổi kể từ lần kiểm tra. [Import/export T34](#importexport-t34)

Để bật upload/xem trước trên trình duyệt, chạy Catalog media và worker T33. Cấu hình `BFF_CATALOG_MEDIA_ORIGIN` đúng origin ký URL của kho riêng. Dùng HTTPS, fixture cục bộ cho phép HTTP `127.0.0.1`. Trên bucket upload, đặt CORS chỉ cho Web origin, method `PUT` và headers `content-type`, `if-none-match`, `x-amz-checksum-sha256`. Giữ bucket private và bật versioning. Khi worker chưa hoàn tất, UI cho kiểm tra lại trạng thái. Chỉ đính kèm tệp READY của quản trị viên hiện tại. Liên kết xem trước hiệu lực tối đa 60 giây.

```powershell
pnpm build
$env:CMS_TEST_TOOLS='true'
$env:PLAYWRIGHT_BROWSERS_PATH=(Resolve-Path '.local/browsers').Path
pnpm exec playwright test tests/browser/auth.spec.mjs
```

Ca media và import/export cần các công cụ local trong [runbook media](#media-catalog-t33). Test khởi tạo bucket, gói KB thử nghiệm và database tạm rồi dọn sau khi chạy.

### Catalog CMS T31

Dừng writer Catalog bản cũ và bootstrap CLI trước migration 004 để mọi lệnh công bố sau backfill đều pin revision. Chạy migrate bằng role DDL, kiểm `/health/ready`, rồi khởi động writer mới. Trước khi bật ghi, smoke nhóm cơ/dụng cụ cũ, bài legacy và đường quản trị qua listener mTLS. Nếu đã có lượt ghi T31, rollback cần bản writer hiểu revision pin hoặc quy trình phục hồi đã diễn tập. `pnpm test:catalog-admin` dùng PostgreSQL tạm. Upload READY trong test là metadata fixture, triển khai object store thuộc T33. [Migration 004](../../backend/apps/catalog/migrations/004_support_cms.sql)

### Lịch sử Catalog T32

Áp dụng migration 005 trước khi chạy bản Catalog có T32. Readiness yêu cầu schema mới nhất của binary. Kiểm qua listener mTLS bằng `pnpm test:catalog-admin`. Khi khôi phục, đọc ETag mới nhất từ owner. Retry giữ nguyên khóa và payload, còn 412 yêu cầu đọc lại trước khi quyết định. Đối chiếu `sourceVersion`, lý do và actor ở audit. Restore chỉ lưu nháp, muốn đổi thư viện cần công bố riêng. [Hợp đồng CMS](../api/API_CONTRACTS.md) · [Migration 005](../../backend/apps/catalog/migrations/005_revision_history.sql)

### Media Catalog T33

Áp dụng migration 006. Upload READY từ bản metadata cũ được chuyển VERIFYING để kiểm bytes trước khi dùng. Bật `CATALOG_MEDIA_ENABLED` tại API và worker, cấu hình bucket private có versioning, prefix riêng, region và origin HTTPS công khai cho gateway Catalog. Origin không chứa path. Biến S3_ENDPOINT chỉ cần với provider S3 tương thích. Cấp credentials Catalog qua AWS credential chain/IAM. Worker dùng cùng kho và database của Catalog. [Mẫu cấu hình](../../backend/apps/catalog/.env.example)

Chạy `pnpm --filter @smartgym/catalog build`, migrate rồi start API. Worker chạy bằng `pnpm --filter @smartgym/catalog media-worker`. Khai báo đường dẫn tuyệt đối FFPROBE/FFMPEG và clamd trên Unix socket hoặc mạng riêng. Giới hạn worker theo process/container, bộ nhớ, CPU và dung lượng thư mục tạm. ClamAV cần signature hiện hành và StreamMaxLength ít nhất 100 MiB. Tắt phân tích mạng/remote của decoder và chặn egress worker tới nguồn chưa được phép. Sự cố scanner/store giữ job VERIFYING với retry, không làm mất thư viện văn bản.

Bucket từ chối public read, không tự xóa version đang được lịch sử Media giữ. CORS chỉ cho origin Web, PUT/GET, Content-Type, If-None-Match và x-amz-checksum-sha256. Blob được gửi nguyên bytes, browser tự đặt Content-Length. Ingress phục vụ gateway media theo đúng path, tắt cache và log query của signed URL. T33 hỗ trợ một byte range. Quyền REJECTED chặn lần đọc public kế tiếp. Preview đã ký có thể dùng tới khi hết hạn trong 60 giây.

GC dọn reservation/rejected sau hết hạn ít nhất một giờ, READY không được lịch sử tham chiếu sau 30 ngày. Nó đánh EXPIRED trước khi xóa đúng object version và retry sau lỗi. Media có support revision được giữ để phục hồi lịch sử. Theo dõi số VERIFYING, attempts, REJECTED theo code và thời điểm xác minh cuối. Rollout production cần nghiệm thu IAM/CORS, decoder sandbox, signature update, tải và backup/restore theo T28/T29.

Trên Windows x64, chạy `node scripts/prepare-media-tools.mjs` rồi `pnpm test:catalog-media`. Script tải binary pin SHA-256 vào .local. Test dùng PostgreSQL, SeaweedFS, ClamAV với database chữ ký thử riêng và FFmpeg. Không suy ra chất lượng phát hiện malware sản xuất từ bộ chữ ký fixture. [ADR 0007](../adr/0007-catalog-media-storage.md)

### Quy trình release chung

1. Build artifact riêng, chạy migration tương thích ngược theo expand → migrate → contract. Triển khai producer/consumer theo ma trận version. Khi đổi event hoặc API phá vỡ, phục vụ song song hoặc có adapter. Ghi thời điểm ngừng phiên bản cũ.
2. Trong staging, khởi chạy và nâng một service tại một thời điểm. Chạy smoke public và luồng phụ thuộc. Tắt Pose rồi RAG, xác nhận Catalog hoạt động. Tắt Catalog để xác minh Web có thông báo và dữ liệu người dùng vẫn được bảo vệ. Kiểm tra ACL bằng credential từng service và ghi bằng chứng từ chối quyền chéo.
3. Rollback artifact theo digest và giữ migration tương thích. Với thao tác dữ liệu không thể đảo nhanh, dừng ghi có kiểm soát, đối chiếu backup và quyết định forward-fix hoặc restore trong môi trường có quyền. Dùng DLQ, replay có lọc và idempotency cho event. Tiến độ gửi email chỉ replay sau khi tra receipt hoặc áp dụng chính sách at-least-once đã chốt.
4. Đề xuất ban đầu `RPO ≤ 24h`, `RTO ≤ 4h` cho dữ liệu nguồn, xác nhận ở M6. Test restore mỗi DB owner trong môi trường cách ly, kiểm khóa, row count và revision, đối chiếu sự kiện mất/đã lặp. Với object tạm Pose, chính sách xóa ưu tiên hơn khôi phục video. RAG rebuild hoặc rollback revision.

## Đo lường và runbook

| Tín hiệu | Hành động |
|---|---|
| Catalog p95, tỷ lệ lỗi, cache revision | Kiểm DB, index và cache, đối chiếu revision. Rollback artifact hoặc cache theo runbook khi contract còn tương thích. |
| Pose queue age, job fail, worker saturation, frame drop | Dừng nhận tải hoặc giới hạn concurrency, giữ polling, kiểm model/CPU/GPU, phục hồi lease và dọn object mồ côi. |
| RAG index lag, provider timeout, citation rejection | Giữ snapshot tốt gần nhất, giảm tải hoặc báo degraded, kiểm event version/revision rồi rebuild. |
| Workout conflict, outbox lag, Notification retry/DLQ | Kiểm timezone/clock và phiên bản occurrence, kiểm broker ACK, chạy replay có dedup. Không gửi lại nhắc đã lỗi thời. |
| Login rate, denied access, xóa dữ liệu lỗi | Cảnh báo, khóa phạm vi ảnh hưởng, xoay bí mật nếu cần, ghi incident bằng ID không nhạy cảm. |

Baseline tải kiểm thử đề xuất gồm 20 request/s public Catalog trong 10 phút, 5 phiên video song song, 3 phiên live, 2 request/s RAG và burst reschedule. M6 chốt cấu hình máy, tải thực, SLO và ngưỡng p95/error trước khi đo. Chưa có số đo runtime. Mọi alert cần owner, severity, bước triage, khi nào rollback và kênh báo.

## Readiness AI bàn giao

### Giao diện tập AI T24

Đăng nhập và mở `/app/tap-ai` từ trang tài khoản. Bật BFF auth, khai báo `BFF_POSE_ORIGIN` và `BFF_POSE_TLS_*`. Bật `BFF_POSE_LIVE_ENABLED` cho camera hoặc cấu hình `BFF_POSE_UPLOAD_ORIGIN` cho video. Đặt origin upload trùng origin ký PUT của Pose. Dùng HTTPS cho ingress và kho, test cục bộ cho phép kho HTTP trên `127.0.0.1`. Capabilities của Pose quyết định bài và chế độ UI có thể sử dụng.

Trên bucket upload private, đặt CORS `AllowedOrigins` bằng Web origin cụ thể, `AllowedMethods` gồm `PUT` và `AllowedHeaders` gồm `content-type`, `if-none-match`, `x-amz-checksum-sha256`. Giữ bucket private và versioning. Nếu PUT bị trình duyệt chặn, kiểm origin, preflight, hạn chữ ký và ba header trước khi thử lại. Video dùng chính sách consent/retention của Pose. Kết quả theo owner mở tại `/app/tap-ai/ket-qua/[id]`. [AWS S3 CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html)

```powershell
$env:POSE_TEST_SOURCE_ROOT='E:\do an\SmartGym'
$env:POSE_TEST_BROWSER='true'
$env:PLAYWRIGHT_BROWSERS_PATH=(Resolve-Path '.local/browsers').Path
pnpm test:pose
```

Ca Chromium dùng nguồn video benchmark làm camera ảo và chạy engine CPU cục bộ. Trước khi bật ở môi trường đích, kiểm thử camera vật lý, quyền trình duyệt và kho upload thực tế theo cổng M5/M6.

### Pose live T23

#### DirectML trên Windows

**Tự khởi động với Windows.** Sau khi chuẩn bị Compose và runtime Pose theo T21, chạy `pnpm setup:pose-autostart` một lần trên mỗi máy Windows x64. Lệnh đăng ký tác vụ `SmartGym Pose Engine` khi người dùng hiện tại đăng nhập và đặt origin trong `.env`. Lần cấu hình đầu cần tạo lại container để nhận origin bằng `docker compose --env-file .env -f infra/compose.yaml up -d --no-build --no-deps pose pose-worker web`. Sau đó có thể bật stack qua Docker Desktop. Phòng tập tự kết nối qua Web và thử lại khi mất kết nối. Tác vụ ưu tiên DirectML và có thể chạy CPU trên cùng endpoint nếu khởi tạo GPU lỗi. Để bỏ đăng ký, dùng Windows Task Scheduler và bỏ biến origin trong `.env` để về CPU trong Compose.

**Chạy qua terminal.** Cách dưới đây dành cho máy chưa bật tác vụ tự khởi động.

Nếu Phòng tập hiện **Mất kết nối**, mở **Trạng thái kết nối AI** để xem bước kiểm tra, lần thử và lỗi gần nhất. Web tự thử lại sau 3 giây. Tác vụ Windows chạy ẩn và kiểm tra chạy lại mỗi phút khi tiến trình Pose đã thoát. Log nằm ở `.local/ai/pose-directml-start.log`. Hộp thoại nhận các giai đoạn gần nhất của launcher từ mount cấu hình chỉ đọc của Web. GPU hoặc CPU chỉ được xác nhận sau khi engine trả health qua mTLS và WebSocket kết nối. Có thể bấm Run cho tác vụ `SmartGym Pose Engine` trong Task Scheduler nếu cần khởi động ngay.

Chạy `pnpm start:local` từ gốc repo sau khi có `.env`, chứng chỉ Compose và nguồn Pose. Trên Windows có thể mở [Chay-SmartGym.cmd](../../Chay-SmartGym.cmd). Chế độ mặc định `auto` kiểm tra GPU NVIDIA từ container Linux x86-64. Nếu Docker cấp được GPU, launcher dùng [Compose CUDA](../../infra/compose.pose-cuda.yaml) và chờ Pose nạp mô hình. Nếu Docker không phát hiện GPU NVIDIA tương thích, launcher thử DirectML trên Windows x64. Khi thiếu runtime host, launcher chuẩn bị dưới `.local/ai/` bằng các script và lock của dự án. Launcher kiểm readiness và provider qua mTLS từ container Web. Nếu không thể khởi chạy hoặc kết nối GPU, launcher chạy cấu hình CPU.

Đặt `SMARTGYM_POSE_ACCELERATION=cpu` trong môi trường hoặc `.env` để buộc chạy CPU. Dùng `pnpm start:local --build` khi cần build lại image. Nút Start trong Docker Desktop dùng lại cấu hình CUDA của container do launcher tạo. Nếu đổi máy hoặc GPU, chạy launcher để dò lại. Khi chẩn đoán DirectML, đọc `.local/ai/pose-directml-start.log`. Khi chẩn đoán CUDA, xem log container `pose-engine`. CPU fallback áp dụng khi chạy launcher.

Nếu máy NVIDIA đã thiết lập GPU cho Docker và cần tạo stack trực tiếp bằng Compose, dùng hai file sau. Bỏ cấu hình `SMARTGYM_POSE_ENGINE_ORIGIN` trỏ về Windows trước khi chạy để Web và worker cùng dùng engine trong Docker.

```powershell
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.pose-cuda.yaml up -d --build --wait
```

Để kiểm thủ công, chuẩn bị runtime Pose cục bộ và chạy `node --env-file=.env scripts/run-pose-directml.mjs`. Engine nghe trên loopback `127.0.0.1:8002` qua mTLS. Detector và RTMPose từng khung dùng DirectML. Bộ phân loại ST-GCN++ và RTMPose theo batch của chế độ cả video dùng CPU.

Đặt `SMARTGYM_POSE_ENGINE_ORIGIN=https://host.docker.internal:8002` trong `.env`, sau đó chạy `docker compose --env-file .env -f infra/compose.yaml up -d --no-build --no-deps pose pose-worker web` khi các image đã có. Trình duyệt tiếp tục dùng `https://127.0.0.1:3100`. Kiểm tra mục kết nối của Pose Studio có báo DirectML. Tác vụ Windows đã đăng ký sẽ tự bật lúc đăng nhập, hoặc launcher có thể bật engine khi cần. Muốn quay về engine CPU trong Compose, bỏ biến trên, khởi động `pose-engine` và tạo lại ba container client.

Chạy migration 002 và khởi động engine mTLS như T22. Đặt `POSE_LIVE_ENABLED=true` cùng `POSE_ENGINE_*` ở process Pose API. Bật `BFF_AUTH_ENABLED` và `BFF_POSE_LIVE_ENABLED`, cấu hình Pose HTTPS origin và `BFF_POSE_TLS_*` cho BFF. Giữ worker cleanup hoạt động để dọn kết quả hết hạn. Tại ingress, hỗ trợ WebSocket Upgrade và giữ đúng host/origin. Các biến mẫu có trong `.env.example` của frontend và Pose. `BFF_POSE_RECHECK_MS` mặc định 30000, cho phép 1000–30000 ms. Chọn theo tải Identity và độ trễ thu hồi phiên chấp nhận được.

BFF giữ một listener public và chuyển upgrade khác sang Next. Next gắn listener tự động lên HTTP server riêng không listen. Khi có sự cố, kiểm TLS, Origin, cookie, Identity introspection, Pose lease, engine manifest và số phiên đang xử lý. Reconnect cần session mới nếu phiên trước đã FAILED hoặc EXPIRED. Frame camera ở bộ nhớ. Raw observation gần nhất giữ scope gốc và cùng TTL 30 ngày với summary. [ADR 0012](../adr/0012-pose-live-session.md)

### Pose upload và worker T22

Pose API, worker và engine chạy thành ba process trong cùng boundary. Cấu hình PostgreSQL Pose, bucket private bật versioning, thư mục tạm có ACL riêng và FFmpeg/FFprobe đã xác minh. Dùng `.env.example` của service làm danh sách biến, nạp bằng secret manager hoặc shell. Cấp cert Pose outbound với caller `pose` trong `IDENTITY_CALLER_FINGERPRINTS`. Cert BFF vào API và cert Progress đọc summary có allowlist riêng. CA dành cho engine chỉ phát client cert cho Pose API/worker được phép. Liveness/readiness API yêu cầu mTLS. Giữ `POSE_UPLOAD_ENABLED=false` đến khi worker, storage và engine sẵn sàng.

```powershell
pnpm --filter @smartgym/pose build
pnpm --filter @smartgym/pose migrate
# Process 1, dùng đường dẫn cert/key thực từ secret mount
node scripts/run-pose-engine.mjs --source 'E:\do an\SmartGym' --port 8001 --key '<server-key>' --cert '<server-cert>' --ca '<worker-ca>'
# Process 2
pnpm --filter @smartgym/pose start
# Process 3
pnpm --filter @smartgym/pose worker
```

Engine local bind 127.0.0.1 và xác minh SHA-256 bốn model trước startup. Worker so manifest qua mTLS trước dispatch. Worker giữ lease năm phút và deadline xử lý bốn phút. Lỗi trước dispatch có thể thử lại tối đa ba lần. Lỗi hoặc lease hết hạn sau dispatch chuyển `FAILED/INFERENCE_OUTCOME_UNKNOWN`. Người vận hành tra job theo ID và trạng thái. Job hủy giữ `CANCELED` kể cả engine trả kết quả muộn. Raw result chỉ BFF có owner assertion đọc được. Progress có route riêng chỉ trả summary.

Đặt cảnh báo cho upload đã hết hạn còn bytes, tuổi hàng đợi, số lease hết hạn sau dispatch và lỗi dependency. Worker xóa object theo version sau khi grant hết hạn và job terminal, hoặc khi raw TTL 24 giờ đến hạn. Theo dõi và chạy lại cleanup khi object store khôi phục. Rollout production cần diễn tập retention khi worker/storage gián đoạn và cấu hình lifecycle phù hợp cho cả object versions trong prefix Pose. API hết hạn job/result sau 30 ngày. Raw result đã dọn trả 404. File tạm của worker được dọn khi hoàn tất tác vụ, thư mục còn sót sau process chết cần kiểm và dọn bằng runbook, chỉ trong temp root dành riêng cho worker đã dừng.

Để chạy luồng kiểm thử TCP thật, chuẩn bị runtime T21 và media tools, đặt `$env:POSE_TEST_SOURCE_ROOT='E:\do an\SmartGym'`, rồi chạy `pnpm test:pose`. Test tạo PostgreSQL, S3 và hai CA dùng riêng, kiểm API và worker dưới process độc lập. Trình duyệt/BFF, WebSocket, corpus RAG và môi trường production có cổng nghiệm thu riêng. [ADR 0011](../adr/0011-pose-coordination.md)

### Runtime cục bộ T21

Người dùng chọn chạy trên máy Windows này. [ADR 0010](../adr/0010-local-ai-cpu-runtime.md) chốt uv 0.13.7/CPython 3.12.16 build 20261026, hai venv riêng và profile smoke CPU. Binary, venv, cache và temp đều ở .local/ai, không đổi PATH/registry hay cài Windows service. Lock RAG giữ 23 pin bàn giao; Pose local có 54 package, CPU ORT 1.31.1, Torch 2.5.1+cpu, OpenCV 4.12.0. Profile GPU production chưa nghiệm thu. Không chạy install trong lúc provider đang dùng cùng venv.

```powershell
node scripts/prepare-ai-tools.mjs
node scripts/prepare-ai-runtime.mjs
node scripts/ai-dependencies.mjs install pose
node scripts/ai-dependencies.mjs install rag
node scripts/ai-dependencies.mjs check pose
node scripts/ai-dependencies.mjs check rag
```

Install dùng lock có hashes tại infra/ai, chỉ dùng wheels. Resolve là thao tác bảo trì riêng, cần root provider tương ứng: `node scripts/ai-dependencies.mjs resolve pose 'E:\do an\SmartGym'` hoặc `resolve rag 'E:\do an\smart-gym-ai\services\kb_rag'`. Candidate khác lock hiện có sẽ dừng để review, không ghi đè lock. Pose profile thay dòng GPU ở input cục bộ, không sửa requirements nguồn; ghim contrib bằng core vì rtmlib yêu cầu cả hai. Namespace OpenCV dùng chung là vấn đề đóng gói cần xử lý trước production, pip check đơn lẻ không chứng minh an toàn. Reinstall profile CPU để loại overlay từ bản GPU hoặc contrib khác phiên bản.

Mỗi lần Pose smoke dùng output directory mới. Ví dụ:

```powershell
node scripts/test-ai-providers.mjs pose --pose-root 'E:\do an\SmartGym' --output '.local/ai/smoke-example-1'
node scripts/test-ai-providers.mjs rag --rag-root 'E:\do an\smart-gym-ai\services\kb_rag' --output '.local/ai/smoke-example-1'
node scripts/test-ai-providers.mjs pose --pose-root 'E:\do an\SmartGym' --output '.local/ai/smoke-example-floor-2' --exercises push_up situp --prefer-reference
node scripts/test-ai-providers.mjs rag --rag-root 'E:\do an\smart-gym-ai\services\kb_rag' --output '.local/ai/smoke-example-floor-2'
node scripts/test-ai-providers.mjs rag-regressions --rag-root 'E:\do an\smart-gym-ai\services\kb_rag' --output '.local/ai/regressions-example'
```

Harness dùng FastAPI TestClient để kiểm upload/WebSocket in-process và validator RAG bằng raw output thật; không mở listener public. Video benchmark đọc tại nguồn, không sao chép/publish. comparison ground truth bị loại khỏi fixture, source filename được thay bằng hash; model digest gắn từ manifest đã kiểm. Raw fixtures ở .local bị ignore Git. Không tự phát minh số rep cho toàn video. Khi clip không đủ quan sát, giữ nguyên insufficient; prefer-reference chỉ chọn functional baseline, không xác nhận tính đúng kỹ thuật từ tên file. Hai clip đầu bị insufficient và hai clip baseline sau hợp lệ đã được giữ trong báo cáo.

[Báo cáo nghiệm thu](../api/ai-runtime-verification.yaml) ghi 14 raw fixtures RAG nhận, bốn model đủ ba scope, regression provider 16/16, token thiếu trả 401 và token hợp lệ với index rỗng trả 503/kb_ready=false. Regression provider dùng text tổng hợp, không phải corpus thật. T21 nhận engine; T22/T23 vẫn phải thêm user/owner auth, mTLS và adapter Web trước khi bật AI. Ollama/Neo4j/quality/load/GPU chưa được nghiệm thu. Cần nhận corpus/index và canonical rules còn thiếu từ đội bàn giao; đã kiểm cả services.rar, không tự tạo tri thức thay thế để đánh dấu chatbot sẵn sàng.

T21 có công cụ đọc nguồn, không chạy script provider và không tạo cache trong nguồn:

```powershell
node scripts/check-ai-handoff.mjs --pose-root 'E:\do an\SmartGym' --rag-root 'E:\do an\smart-gym-ai\services\kb_rag'
node --test tests/contracts/ai-handoff.test.mjs
```

Đường dẫn được truyền rõ khi chạy, không hardcode trong công cụ. Kiểm ONNX bytes, contract raw/LF, schema, label semantics, preprocessing và Catalog ID. PASS chỉ là SOURCE_VERIFIED, không mở capability AI. Tests dùng dữ liệu API tổng hợp, không phải fixture inference. Tiếp nhận runtime từ đội AI cần Python executable/môi trường dependencies đúng manifest, weights detector/pose có provenance, clip thử được phép, corpus/index KB và LLM runtime. Không tự gọi RTMPoseTracker khi thiếu weights cục bộ vì có thể tải model/cache vào nguồn hoặc thư mục người dùng.

Nguồn và hợp đồng theo [ADR 0008](../adr/0008-ai-provider-handoff.md). Pose `/api/health` phải có ready=true và manifest model khớp bốn digest đã kiểm. RAG `/health` phải có kb_ready=true, đúng kb_version/runtime_revision. Health HTTP 200 không chứng minh Ollama hoặc inference thành công. Corpus/index đang thiếu trong bản mã nguồn được đọc, cần khôi phục dữ liệu đúng nguồn/giấy phép và chạy smoke generate=true. Kiểm kê nguồn ban đầu không chạy provider; smoke CPU T21 đã được thực hiện như bằng chứng bên trên.

RAG giữ snapshot.json/embeddings.json và Neo4j theo cấu hình, restart sau ingest theo hướng dẫn bàn giao. Đặt token nội bộ không rỗng, giữ API engine private sau adapter/transport có auth. T27 đo end-to-end budget vì provider có thể gọi LLM nhiều lần với timeout 120 giây mỗi lời gọi. Lỗi RAG không hạ Catalog. Feed Catalog, freshness và tombstone chỉ được bật sau T26/T36 đạt.

## Runbook CMS

### Import/export T34

Chạy migration 007 trước artifact mới. Readiness đòi migration 7. Không thay file migration cũ. Export bootstrap và CMS dùng cùng revision trong publication_revisions. [ADR 0009](../adr/0009-cms-import-export.md)

Operator chuẩn bị thư mục chỉ đọc chứa registry.json và các gói JSON. Cấu hình CATALOG_IMPORT_REGISTRY_FILE tới registry, không mount secrets cùng thư mục. Entry registry có sourceKey=SMARTGYM_KB, sourceRevision, manifestSha256, file tương đối. File phải còn trong thư mục registry khi phân giải symlink, không nhận URL. Hash là SHA-256 trên JSON canonical của toàn gói, dùng fingerprint đã build trong Catalog hoặc cùng RFC 8785. Không lấy hash raw file có khoảng trắng làm manifestSha256.

Gói có đúng bốn trường: sourceKey, sourceRevision (ASCII chữ/số/dấu chấm/gạch, tối đa 120), provenance và records. provenance chứa sourceRef, sha256 của nguồn và rights (mỗi mô tả tối đa 500 ký tự). records có 1–200 phần tử, tổng file ≤2 MiB. Bài tập dùng `{ "contentType": "exercise", "data": { ...ExerciseDraftCreate } }`. Bốn loại còn lại dùng CmsContentCreate gồm id/contentType/data. Mỗi type/id chỉ xuất hiện một lần. Tham chiếu là stable ID, media dùng uploadId đã READY của actor được phép; không đưa bytes, path local hoặc URL chưa kiểm vào bản public. Import không tự suy diễn quyền phát hành từ trường rights.

Ví dụ một record bài tập:

```json
{"contentType":"exercise","data":{"id":"kb_demo","slug":"kb-demo","nameVi":"Bài tập KB","summary":"Hướng dẫn đã kiểm kê.","primaryMuscleIds":["quadriceps"],"equipmentIds":[],"instructions":["Đứng vững, kiểm soát chuyển động."],"sourceRef":"kb:reviewed-source"}}
```

Nhóm cơ trong ví dụ phải tồn tại hoặc được khai báo trong cùng gói. JSON snapshot bootstrap smartgym-m2.json là định dạng cũ, không gửi trực tiếp thành gói CMS: chỉ chuyển trường văn bản đã duyệt sang ExerciseDraftCreate, không tự chuyển media/variant cũ thành tài sản được phép. Nguồn RAG JSON/Neo4j không đi qua workflow này và không bị sửa.

ADMIN gọi POST /api/v1/admin/catalog-imports với ba trường registry và Idempotency-Key. Đọc job để lấy report và ETag, rồi POST /{jobId}/apply với If-Match, khóa mới và `{ "mode": "DRAFT_ONLY" }`. Apply không cần file nguồn nữa vì DB giữ payload đã kiểm. Base thay đổi trả 409 IMPORT_BASE_CHANGED: không ép ghi đè, tạo gói/revision mới và validate lại. REJECTED không apply được. Mọi loại được áp dụng nguyên tử, sau đó vẫn cần duyệt/publish từng nội dung qua CMS. UI/BFF cho các route mới thuộc T35.

GET /api/v1/admin/catalog-exports/{revision} xuất snapshot hiện hành hoặc bản đã lưu còn hạn. Publication gồm bài public, sources từ hướng dẫn và tombstone. Source ID là ex_ cộng SHA-256 exercise ID; digest nguồn là SHA-256 UTF-8 của summary/instructions/commonMistakes nối bằng hai newline. sourceRef trỏ Catalog content revision, không lộ path nguồn import. Bản export lưu bảy ngày, generatedAt ổn định; kiểm lại visibility và media mỗi lần đọc. Bản cũ chưa lưu, hết hạn, thay revision hoặc bị gỡ trả 410; không có revision trả 404. Không tự dựng snapshot lịch sử từ nội dung hiện tại. T36 còn cổng feed RAG riêng.

GC operator chỉ xóa catalog_exports có expires_at≤now() trong database Catalog với quyền phù hợp. Giữ job/report/audit theo chính sách quản trị; không xóa catalog_imports bootstrap, revision hoặc idempotency còn hiệu lực. Giám sát 409 base conflict, REJECTED, 503 package/storage/database và số job chưa apply. Import package chỉ mount read-only, migration/runtime role tiếp tục tách quyền tại cổng deployment.

- Theo dõi số import lỗi/đang chạy, media quarantine, 409/412, thời gian publish, outbox lag, cache purge và Catalog head freshness. Log dùng job ID, content ID/revision và correlation ID.
- Import validate trước, apply nháp khi base versions khớp. Nếu thất bại, giữ public revision, đọc báo cáo theo provenance và revalidate snapshot đã sửa. Khi đã publish nhầm, restore dữ liệu revision đúng thành nháp và publish revision mới. Không reset sequence hoặc sửa outbox đã phát. Archive/thu hồi quyền media thực hiện deny và purge theo runbook, giữ audit.
- Khi broker lỗi, publication vẫn commit cùng outbox. Replay giữ event ID và version. Provider RAG dùng head/snapshot để reconcile; Catalog không truy cập index provider. Khi invalidation lỗi, retry purge và để TTL bù. Backup Catalog DB cùng manifest object version, khôi phục trong staging và đối chiếu checksum/ref trước mở traffic.

## Vận hành và giám sát cục bộ

Docker Compose đặt trần CPU, RAM và PID cho từng container. Dùng `docker stats` lúc rảnh và khi chạy video hoặc sinh câu trả lời để chỉnh `SMARTGYM_<SERVICE>_MEMORY` và `SMARTGYM_<SERVICE>_CPUS`. Các mức mặc định là điểm khởi đầu. Kiểm tra `docker compose ps -a` để phân biệt container đang chờ sẵn sàng, đang lỗi probe và bootstrap đã hoàn tất. Healthcheck của các API mTLS dùng certificate của chính container và quyền đọc probe giới hạn ở loopback. Worker và relay cập nhật heartbeat sau vòng xử lý.

Để bật metrics, log tập trung và trace trên Compose cục bộ, đặt biến trước khi khởi động hoặc tạo lại service:

```powershell
$env:SMARTGYM_OTEL_DISABLED = 'false'
docker compose --env-file .env -f infra/compose.yaml --profile observability up -d --build
```

Mở Grafana tại `http://127.0.0.1:3030`. Dashboard **SmartGym Operations** hiển thị tốc độ request, p95, RSS và tuổi outbox. Dùng Explore để truy vấn log Loki theo service hoặc trace trong Tempo. Prometheus đánh giá rule mất tín hiệu Web, tăng lỗi, độ trễ và outbox tồn lâu. Alertmanager gom cảnh báo tại `http://127.0.0.1:9093`. Cấu hình email hoặc webhook riêng khi cần gửi ra ngoài.

Redis chạy trong mạng riêng của Web, Catalog và Identity. Web dùng bộ đếm chat và lease theo người dùng hoặc IP. Catalog cache revision public bất biến sau khi truy vấn con trỏ công bố trong PostgreSQL. Identity dùng Redis làm chỉ mục từ hash phiên đến owner, còn PostgreSQL xác minh phiên, quyền, thời hạn và trạng thái thu hồi mỗi lần. Catalog và Identity fallback về PostgreSQL khi Redis gián đoạn. Chat dùng Redis khi được cấu hình và trả lỗi tạm thời khi Redis gián đoạn.

Circuit breaker tách kiểm tra readiness khỏi request sinh câu trả lời của RAG. Sau ba lần lỗi liên tiếp, breaker ngắt trong 15 giây và sau đó chỉ cho một lần thăm dò. Giới hạn này theo từng tiến trình Web. Dùng `pnpm check:contracts` và `node --test tests/integration/resilience.test.mjs` để kiểm hợp đồng và luồng mở, thăm dò, phục hồi.

### Ollama GPU trên Windows

Trên máy Windows có Ollama và các model đã cài trong thư mục mặc định của người dùng, chạy `powershell -NoProfile -File scripts/install-ollama-autostart.ps1` từ gốc repo. Tác vụ **SmartGym Ollama GPU** bật Vulkan và khởi động Ollama ngầm khi đăng nhập Windows. API lắng nghe trên `127.0.0.1:11434`. Nếu Ollama đang chạy sẵn, thoát tiến trình hiện có trước khi chạy tác vụ để nạp cấu hình Vulkan.

Đặt `SMARTGYM_OLLAMA_ORIGIN=http://host.docker.internal:11434` trong `.env`, rồi chạy `docker compose --env-file .env -f infra/compose.yaml up -d --no-deps rag`. Hỏi một câu qua **Ollama local** rồi chạy `ollama ps` để xem cột `PROCESSOR`. Windows và container cần có các model phù hợp với cấu hình trước khi chuyển. Để dùng lại Ollama trong Docker, bỏ biến origin và tạo lại container `rag`.
