# Frontend Codebase Audit — SmartGym Web

**Trạng thái:** Báo cáo và đề xuất, chờ phê duyệt. Baseline là `4b1bfc0` cộng các thay đổi sẵn có trong working tree. Audit lấy file hiện tại làm chuẩn, kể cả file chưa track. Các file đã bị xóa trước lượt này không được tính là đề xuất mới.

**Đề xuất:** Giữ Next.js App Router và cây thư mục hiện tại. Dọn các thành phần đã xác minh không được sử dụng trước. Sau đó chỉnh một số ranh giới đã có bằng chứng, chủ yếu là client dùng chung của Workout/Progress/Notification và các module lớn. Không có lý do để đổi toàn bộ frontend sang Feature-Based, Layer-Based hay FSD.

## 1. Phạm vi và phương pháp

- Kiểm kê **129 file** mã nguồn, hợp đồng và cấu hình được đưa vào đồ thị, gồm **35 file page**. Đồ thị lấy **46 entrypoint** từ các quy ước App Router và entrypoint/config của Web. Đã theo import tĩnh, export lại, import động có chuỗi literal, require literal và URL tương đối dùng để đọc file, đồng thời đối chiếu tham chiếu từ test/script. Các thư mục build, cache và dependency cài đặt không nằm trong số đếm.
- Đồ thị thô đi tới cả 129 file. Kết quả này bao gồm các import chết. Sau khi đối chiếu TypeScript và nơi dùng symbol, xác định được một file chỉ có đường vào qua import không được đọc. Vì vậy, đồ thị module một mình không đủ để quyết định xóa.
- Chạy TypeScript chuẩn với `--noEmit --incremental false` và lượt chẩn đoán bổ sung với `--noUnusedLocals --noUnusedParameters`. Đối chiếu named exports qua TypeScript checker, rồi kiểm tra nơi xuất hiện bằng tìm kiếm văn bản. Điều này bao phủ các tham chiếu trực tiếp trong repo; client ngoài repo, chuỗi runtime sinh động và tác động lên bundle cần xác minh riêng nếu có dấu hiệu.
- Đối chiếu Next.js conventions, PostCSS, CSS import, scripts sinh hợp đồng, Dockerfile, lockfile và tài liệu trước khi phân loại. Không dùng việc “không có import TS” làm bằng chứng duy nhất để gỡ dependency.

## 2. Phân loại

### Đang dùng — giữ lại

| Hạng mục | Bằng chứng |
|---|---|
| Route, layout, error boundary, trang 404 và sitemap | Next.js gọi theo quy ước. `/app/chuong-trinh` là route redirect thật sang `/ke-hoach-tap`; route con tạo/sửa chương trình vẫn dùng `PlanEditor`. [Redirect](../../frontend/app/app/chuong-trinh/page.tsx) · [Editor](../../frontend/app/workout/plans.tsx#L34) |
| BFF, bảy JSON hợp đồng và các script sinh | `server.mjs` phân tuyến các handler theo API. Một số schema được đọc từ file bằng URL. Test có import trực tiếp module BFF. [Entrypoint](../../frontend/server.mjs) · [Schema Pose](../../frontend/server/pose-live.mjs#L16) · [Sync Web Admin](../../scripts/sync-web-admin-contract.mjs) |
| Chat toàn trang và RagDock | Cả hai có đường vào và cùng gọi chat. Chat toàn trang lưu lịch sử và quản lý kết quả đính kèm; dock hoạt động trong Pose Studio. [Trang chat](../../frontend/app/hoi-dap/chat.tsx#L288) · [Điểm gắn dock](../../frontend/components/pose-studio.tsx#L1589) |
| Planner chạy trên trình duyệt và editor chương trình server | Planner lưu kế hoạch vào localStorage; editor ghi qua Workout. Khác cơ chế lưu và trách nhiệm, cần giữ cả hai trong đợt này. [Planner](../../frontend/components/workout-planner.tsx#L393) · [Editor](../../frontend/app/workout/plans.tsx#L34) |
| Pose client đọc kết quả, Studio đang dùng camera/video | `training.tsx` dùng `pose`, `PoseError`, `errorText`, `exerciseNames`, `UUID`, `Result`; route chi tiết và Progress dùng `UUID` hoặc `Result`. Studio có transport khác. [Result UI](../../frontend/app/app/tap-ai/training.tsx) · [Progress import](../../frontend/app/progress/pose-import.tsx) · [Studio transport](../../frontend/components/pose-studio.tsx#L289) |
| Build, CSS và thiết kế | `@tailwindcss/postcss` có trong cấu hình, `tailwindcss` được CSS nạp. `postcss`, `react-dom`, các gói `@types` và TypeScript là phần của build/type-check. Bảy ảnh dưới `frontend/design/cms` là tài liệu thiết kế được tham chiếu. [PostCSS](../../frontend/postcss.config.mjs) · [CSS](../../frontend/app/globals.css) · [Thiết kế CMS](../design/UI_UX.md#6-admin-dashboard-cms) |

### Chắc chắn thừa trong mã hiện tại

| Mục | Bằng chứng và xử lý dự kiến sau phê duyệt |
|---|---|
| **F01 · Import và biến cục bộ** | TypeScript đánh dấu unused imports trong `draft-preview.tsx`, `editor.tsx`, trang chi tiết bài tập và `chat.tsx`. Ví dụ `React`, `Clock`, `Dumbbell`, `cn` ở preview; `useCmsPage`, `Card` và một số icon ở editor; `hasMedia` trong editor và `cid` trong chat. Dọn khai báo/import, giữ biểu thức hoặc luồng nếu có tác dụng phụ. [Preview](../../frontend/app/admin/draft-preview.tsx#L3) · [Editor](../../frontend/app/admin/editor.tsx#L13) · [Chi tiết](../../frontend/app/bai-tap/%5Bslug%5D/page.tsx#L12) · [Chat](../../frontend/app/hoi-dap/chat.tsx#L924) |
| **F02 · File `components/ui/badge.tsx`** | Nơi import duy nhất là trang chi tiết bài tập, nơi TypeScript xác nhận `Badge` không được đọc. Không thấy test/script, export động hay Next convention gọi file này. Có thể xóa import và file trong cùng thay đổi. `class-variance-authority` vẫn được `Button` dùng. [Badge](../../frontend/components/ui/badge.tsx#L5) · [Import](../../frontend/app/bai-tap/%5Bslug%5D/page.tsx#L24) · [Button](../../frontend/components/ui/button.tsx#L6) |
| **F03 · Thành phần trong file đang dùng** | `PlanList` không có nơi render; route cũ redirect, còn `PlanEditor`/picker có caller. `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` và `CardFooter` chỉ có tham chiếu `displayName` nội bộ. `DialogClose` alias, `PaginationEllipsis`, `DIFFICULTY_LABELS`, `NativeSelectProps` cũng không có caller. Có thể dọn riêng từng symbol. Giữ `Card`, các thành phần phân trang được import, `NativeSelect` và nút đóng tích hợp của dialog. [Plans](../../frontend/app/workout/plans.tsx#L7) · [Card](../../frontend/components/ui/card.tsx#L18) · [Dialog](../../frontend/components/ui/dialog.tsx#L9) · [Pagination](../../frontend/components/ui/pagination.tsx#L111) · [Exercise visuals](../../frontend/components/exercise-visuals.tsx#L18) · [NativeSelect](../../frontend/components/ui/native-select.tsx#L5) |
| **F04 · Helper Pose browser cũ** | Không có caller cho `sleep`, `prepareUpload`, `putVideo`, `MAX_VIDEO_BYTES`, `Capability`, `Job` và `Live` trong module này. `Grant` chỉ phục vụ hai helper upload đó. Có thể dọn nhóm này sau khi chạy ca đọc chi tiết/import Pose. Không suy từ đó ra rằng endpoint upload, API Pose hay toàn bộ module đã thừa. [Pose client](../../frontend/app/app/tap-ai/pose-client.ts#L1) · [Hai đường transport đang tồn tại](BACKEND_AUDIT.md#ba-01--high--đã-xác-minh-từ-mã--pose-studio-không-áp-dụng-cùng-chính-sách-với-pose-jobs) |
| **F05 · Export rộng hơn caller thực tế** | `useTheme` chỉ gọi bên trong file. `DialogPortal` và `DialogOverlay` được `DialogContent` dùng. `ResultSummary` và `googleIdentity` có caller nội bộ. Các type như `InputProps`, `ButtonProps`, `Profile`, `ImportedPoseSummary`, `V4LabelContract` và một số DTO của chat cũng dùng cục bộ. Có thể thu phạm vi export nếu giúp làm rõ API module; giữ khai báo/logic đang dùng. [Theme](../../frontend/components/theme-toggle.tsx#L27) · [Dialog](../../frontend/components/ui/dialog.tsx#L28) · [Kết quả Pose](../../frontend/app/app/tap-ai/training.tsx#L8) · [Google](../../frontend/server/google-auth.mjs#L24) |
| **F06 · Hai dependency trực tiếp không có consumer tĩnh** | `motion` và `@radix-ui/react-dropdown-menu` chỉ xuất hiện ở manifest/lockfile trong đường thực thi được rà. Không có import, plugin hoặc script gọi hai package này. Đưa vào một thay đổi dependency riêng nếu được duyệt; xác minh install với frozen lockfile và build Next/Docker. Không nâng hay thay gói khác kèm theo. [Manifest](../../frontend/package.json) · [Lockfile](../../pnpm-lock.yaml) |

### Nghi ngờ thừa hoặc đang dùng với vai trò khác

| Mục | Điều kiện trước khi sửa |
|---|---|
| State Pose ghi mà không đọc | TypeScript báo `configured`, `cameras`, `resolutionText`, `displayFps` và `setSelectedCameraId`. `configuredRef` vẫn điều khiển gửi frame và resume. `selectedCameraId` vẫn được đọc để chọn camera; `listCameraDevices` còn gọi API trình duyệt. `displayTimesRef` phục vụ display FPS, còn analysis FPS/roundtrip vẫn hiện. Chỉ xem xét bỏ chuỗi update đã xác minh sau khi có ca camera, pause/resume và đổi nguồn. [State](../../frontend/components/pose-studio.tsx#L80) · [Đo frame](../../frontend/components/pose-studio.tsx#L561) · [Mở camera](../../frontend/components/pose-studio.tsx#L640) |
| Đường cấu hình engine Pose khác origin | Có UI cấu hình và lưu `smartgym.server`, nên có consumer thực. Chưa có thống kê sử dụng. Giữ ngoài đợt cleanup. [Đọc cấu hình](../../frontend/components/pose-studio.tsx#L418) · [Lưu cấu hình](../../frontend/components/pose-studio.tsx#L1181) |
| Mã lỗi Pose, contract và CSS class ít tham chiếu | Có thể đến từ API, giá trị động hoặc markup. Cần đối chiếu hợp đồng và ma trận màn hình trước khi kết luận. Audit không đề xuất sửa CSS, đổi danh sách mã lỗi hay thu hẹp API. [Pose client](../../frontend/app/app/tap-ai/pose-client.ts#L22) · [Contract](../../frontend/data/pose-live-contracts.json) |

## 3. Trùng lặp và tổ chức mã

| Phát hiện | Bằng chứng và thay đổi tối thiểu |
|---|---|
| **Tên module hạ tầng browser gắn sai phạm vi** | `workout/api.ts` và `workout/shared.tsx` phục vụ cả Workout, Progress và Notification. Đường phụ thuộc này khiến chỉnh fetch, ETag hoặc cảnh báo mất dữ liệu ở Workout có thể ảnh hưởng màn hình khác. Sau cleanup, cân nhắc tách đúng helper transport thuần đã có nhiều caller sang một file `lib`; giữ domain types, lỗi và UI adapter tại khu vực đang sở hữu. [Client](../../frontend/app/workout/api.ts#L36) · [Progress](../../frontend/app/progress/editor.tsx#L4) · [Notification](../../frontend/app/notifications/views.tsx#L6) |
| **Hook tải dữ liệu có hình dạng giống nhau nhưng vòng đời khác** | `useResource`, `useCmsPage`, logic tải editor và `useInbox` đều có abort/retry. CMS gắn kết quả với đường dẫn/lượt tải; inbox theo dõi generation, refresh và xóa dữ liệu khi mất phiên. Không gom thành một hook chung ngay. Nếu tách helper, chứng minh từng màn giữ đúng loading, dữ liệu cũ, retry và hủy request. [Workout hook](../../frontend/app/workout/shared.tsx#L4) · [CMS hook](../../frontend/app/admin/cms-request.tsx#L32) · [Editor](../../frontend/app/admin/editor.tsx#L301) · [Inbox](../../frontend/app/notifications/views.tsx#L22) |
| **Các enum bài tập và một phần kiểu phản hồi chat bị khai báo lặp** | Public Catalog và CMS khai báo cùng literal cho workout type, focus area và pose style. Chat và dock có kiểu Reference/Answer gần nhau nhưng không mặc định cùng tập trường. Chỉ chia sẻ phần trùng hoàn toàn, dùng import type; giữ kiểu draft/public, kiểu UI và hợp đồng sinh độc lập theo trách nhiệm. [Catalog](../../frontend/app/catalog.ts#L9) · [CMS](../../frontend/app/admin/cms.ts#L3) · [Chat](../../frontend/app/hoi-dap/chat.tsx#L41) · [Dock](../../frontend/components/rag-dock.tsx#L8) |
| **BFF lặp thao tác HTTPS/JSON** | Progress và Notification có `forward` gần giống nhau; Catalog, Workout và Chat cũng lặp từng đoạn nhưng có giới hạn phản hồi, header, lỗi và chính sách khác. Giữ handler, validate schema và quyền riêng từng domain. Chỉ cân nhắc helper HTTPS thuần sau khi có hồi quy đầy đủ; không tạo gateway chung hay sửa API trong đợt cleanup. [Progress BFF](../../frontend/server/progress.mjs#L21) · [Notification BFF](../../frontend/server/notifications.mjs#L19) · [Catalog BFF](../../frontend/server/catalog-admin.mjs#L83) |
| **Ba module lớn có ranh giới tách tự nhiên** | Pose Studio khoảng 1.600 dòng kết hợp camera/video, WS, RAF, overlay và dock. Editor CMS khoảng 1.350 dòng có hàm đọc form, validation, ghi, công bố và UI. Chat khoảng 1.240 dòng kết hợp render nội dung, lưu lịch sử và request. Nếu tách, bắt đầu từ helper thuần của CMS hoặc một khối đã có tên như `FormattedContent`. Để vòng đời camera/WS cho một bước riêng có test. [Pose](../../frontend/components/pose-studio.tsx#L66) · [CMS](../../frontend/app/admin/editor.tsx#L109) · [Chat](../../frontend/app/hoi-dap/chat.tsx#L170) |
| **Server/client boundary phần lớn rõ** | `app/auth/session.tsx` gọi `server/identity-client.mjs` từ Server Components; đây là phụ thuộc có chủ đích. Các client cần kiểu Catalog đang có thể import type. Giữ phần đọc biến môi trường, cookie, TLS và schema trong đường server; tránh chuyển file để đạt một quy tắc thư mục hình thức. [Server session](../../frontend/app/auth/session.tsx#L1) · [Catalog fetch](../../frontend/app/catalog.ts#L76) |

### So sánh phương án

| Phương án | Lợi ích | Chi phí và quyết định |
|---|---|---|
| Giữ cây hiện tại, dọn tại chỗ và tách theo caller thật | Bảo toàn route, dễ đọc diff, phù hợp 35 page và đa số module đã đặt gần nơi dùng. | **Chọn.** Vẫn cần đặt tên rõ cho helper dùng giữa ba khu nghiệp vụ. |
| Gom toàn bộ theo feature | Có thể có ích khi mỗi domain có đội sở hữu và nhiều module dùng chung giữa các route. | Di chuyển nhiều import và đổi cách tra cứu. Hiện `admin`, `workout`, `progress` và `notifications` đã có mức gom đủ để xử lý các vấn đề quan sát được. |
| Chia cứng theo layer/FSD | Có thể áp luật phụ thuộc rộng nếu quy mô lớn hơn. | Tạo thêm tầng và đường vòng, chưa giải quyết trực tiếp phụ thuộc transport hoặc kích thước ba file lớn. Không chọn ở quy mô hiện tại. |

Cây mục tiêu giữ `app/` cho route và mã sát route, `components/ui/` cho primitive, `components/` cho phần UI dùng chung hoặc màn hình lớn đang có điểm vào rõ, `lib/` cho helper thuần có nhiều caller, `server/` cho BFF và `data/` cho hợp đồng sinh. Giữ `design/` làm tham chiếu. Chỉ thêm file khi tách được một trách nhiệm hiện hữu.

## 4. Kế hoạch thực hiện sau phê duyệt

| Bước | Phạm vi | Điều kiện hoàn thành |
|---|---|---|
| **0 · Chốt baseline** | Ghi route/redirect, kết quả build, test liên quan và ảnh hồi quy theo viewport hiện có. Đối chiếu các test đã lệch baseline. | Có danh sách route và bằng chứng trước thay đổi. Ví dụ test public hiện chờ link Thư viện trỏ `/`, trong khi nav dùng `/bai-tap`. Xác nhận đó là kỳ vọng test cần cập nhật trước khi dùng nó làm cổng, giữ route theo sản phẩm. [Public test](../../tests/browser/public.spec.mjs#L119) · [Topbar](../../frontend/components/topbar.tsx#L46) |
| **1 · Cleanup có bằng chứng** | F01–F03, F05 và F04 ở thay đổi riêng để dễ kiểm tra Pose. Kiểm lại caller trên working tree ngay trước khi xóa. | Type-check và build qua. Không đổi CSS, markup đang render, routes, request hoặc API. Ca CMS, chi tiết bài tập, dialog/pagination, tạo/sửa Workout và đọc/import kết quả Pose qua. |
| **2 · Dependency, duyệt riêng** | Chỉ F06 nếu được chấp thuận rõ. Giữ nguyên phiên bản gói còn lại và các importer ngoài frontend trong lockfile. | Frozen lockfile, build Next và Docker qua. Diff manifest/lockfile chỉ thuộc hai gói và các phụ thuộc chỉ chúng dùng. |
| **3 · Refactor cục bộ** | Bắt đầu bằng một helper fetch/browser đã có consumer thật hoặc phần thuần của editor CMS; sau đó xem xét tách renderer chat. | Mỗi thay đổi giữ DOM/CSS, text, focus, payload, timeout, abort, retry, ETag và idempotency. Chạy ca theo module. Dừng nếu diff mở rộng mà lợi ích chưa rõ. |
| **4 · Hoãn đến khi có kiểm thử phù hợp** | Cleanup vòng đời Pose và helper HTTPS của BFF. | Có ca camera/video pause-resume, giữ thông số, đổi nguồn, WS mất kết nối và ca BFF cho header/TLS/byte limit. Chỉ trình phê duyệt sau khi chốt phạm vi riêng. |

**Cổng chung:** So route, redirect, trạng thái HTTP và DOM/ảnh ở desktop và mobile. Ca tối thiểu gồm auth, CMS draft/preview/publish/412/phân trang, thư viện public, Workout/Progress/Notification, chat và Pose theo phạm vi từng bước. Dùng dữ liệu kiểm thử cô lập nếu test cần backend. Không thay backend, database, route, UI/UX, CSS, responsive, business logic hay hợp đồng API để làm cho test qua.

## 5. Kiểm chứng của lượt audit

- **PASS:** TypeScript chuẩn với `--noEmit --incremental false`, kiểm ranh giới import, OpenAPI 92 operation, các bản sinh hợp đồng Web và Pose, `git diff --check` và 5 ca thuần cho boundary, thời gian Workout frontend và callback Google fixture.
- **Có phát hiện:** Lượt kiểm TypeScript bật `noUnusedLocals/noUnusedParameters` báo khai báo thừa đã liệt kê. Đây là chẩn đoán audit, không phải cờ build hiện hành.
- **NOT RUN:** Build mới, browser/ảnh, phân tích bundle, install, Docker và các ca camera, DB hoặc provider thật. Chúng thuộc bước baseline và nghiệm thu sau khi phê duyệt. Không tuyên bố đã đo cải thiện bundle hay hiệu năng.
- **Tác động:** Chỉ thêm báo cáo Markdown. Kế hoạch chưa được triển khai.

