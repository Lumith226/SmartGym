# Kế hoạch dựng lại giao diện Web

Trạng thái: PROPOSED (2026-11-08). Phạm vi: toàn bộ Web (public, tài khoản, `/app`, `/admin`). Pose và chatbot để sau cùng, chỉ giữ chỗ trong điều hướng. Stack theo [ADR 0024](../adr/0024-frontend-ui-stack.md). Phong cách: hiện đại, tối giản, nền sáng, màu nhấn năng động.

## 1. Vấn đề cần giải quyết
- Chưa có design system, CSS 171 dòng, control mặc định của trình duyệt.
- Trang chủ là tiêu đề + form lọc + lưới thẻ; chưa có hero, chip nhóm cơ, trạng thái rỗng/tải đẹp.
- Thông điệp "bản phát triển / chờ duyệt" lộ ra trang chủ.
- Nội dung mỏng (35 bài, media chưa đủ). Người dùng sẽ cung cấp media thêm.

## 2. Nguyên tắc thiết kế
1. Mobile-first, lưới 4/8px, tối thiểu vùng chạm 44px.
2. Một màu nhấn chính (đề xuất cam-đỏ năng động) + trung tính; trạng thái success/warn/danger riêng.
3. Chữ: một font sans có hỗ trợ tiếng Việt đầy đủ (kiểm dấu), thang cỡ 12–48.
4. Ảnh bài tập là trung tâm: tỉ lệ cố định, skeleton, placeholder có icon nhóm cơ khi thiếu media.
5. Motion ngắn (≤200ms), tắt khi `prefers-reduced-motion`.
6. A11y: tương phản AA, focus ring rõ, giữ nhãn/role hiện có để không vỡ test.
7. Nội dung "bản phát triển" chuyển thành banner nhỏ hoặc footer, không chiếm vị trí chính.

## 3. Màn hình và thành phần
| Khu | Màn hình | Nội dung chính |
|---|---|---|
| Public | Trang chủ | Hero + ô tìm kiếm lớn, chip nhóm cơ, bản đồ cơ, bài nổi bật, CTA đăng ký |
| Public | Thư viện | Bộ lọc (nhóm cơ, dụng cụ, độ khó) dạng chip/drawer, lưới thẻ, phân trang keyset "xem thêm" |
| Public | Chi tiết bài tập | Media lớn/carousel, bước thực hiện, lỗi thường gặp, cơ chính/phụ, biến thể, bài liên quan, nút "thêm vào chương trình" |
| Account | Đăng nhập/đăng ký/quên mật khẩu | Layout 2 cột trên desktop, form RHF+Zod, thông báo lỗi rõ |
| App | Tổng quan | Buổi tập hôm nay, chuỗi ngày, tóm tắt tuần, đường tắt |
| App | Chương trình | Danh sách, trình chỉnh sửa kéo thả bài, tạo từ thư viện |
| App | Lịch | Lịch tháng/tuần, xung đột, đổi/hủy lịch |
| App | Nhật ký + Tiến độ | Form log set nhanh, biểu đồ tuần/tháng, bộ lọc |
| App | Thông báo + Cài đặt + Hồ sơ | Hộp thư, tùy chọn kênh |
| Admin | CMS | Bảng dữ liệu, editor, revision diff, media upload, import/export, audit |
| Chung | Header, footer, nav mobile, toast, dialog, empty/error/loading, 404 | Component dùng lại |
| Để sau | Tập AI, Hỏi đáp | Giữ nguyên chức năng, chỉ khớp theme |

## 4. Task đề xuất (chưa ghi vào TASKS.md)
| ID | Mô tả | Phụ thuộc | Nghiệm thu |
|---|---|---|---|
| T40 | Duyệt ADR 0024, pin phiên bản, cài Tailwind + shadcn nền, token, layout shell, theme | — | Build pass, bảng phiên bản cập nhật, không đổi hợp đồng |
| T41 | Thư viện component cơ sở (Button, Input, Select, Dialog, Toast, Skeleton, Tabs, Card, Table) + Storybook-less trang mẫu nội bộ | T40 | Kiểm a11y bàn phím, ảnh chụp mobile/desktop |
| T42 | Trang chủ + Thư viện + bản đồ cơ | T41 | Test public hiện có pass; ảnh chụp; LCP đo được |
| T43 | Chi tiết bài tập + SEO giữ nguyên | T42 | Metadata/sitemap không đổi; test catalog pass |
| T44 | Auth pages | T41 | Chromium Auth 6/6 vẫn pass (cập nhật selector nếu cần) |
| T45 | Dashboard, Chương trình, Lịch (TanStack Query) | T41 | Chromium workout pass; trạng thái loading/error/empty |
| T46 | Nhật ký, Tiến độ (biểu đồ), Thông báo, Hồ sơ | T45 | Test progress/notification UI pass |
| T47 | Admin CMS | T41 | Chromium CMS 13/13 vẫn pass; kiểm bảng lớn |
| T48 | Đánh bóng: motion, dark mode (tùy chọn), tối ưu bundle, kiểm a11y thủ công | T42–T47 | Lighthouse mục tiêu và đánh giá thủ công ghi trong DESIGN_REVIEW |
| T49 | Nội dung/media: nhận media người dùng cung cấp, nhập qua Catalog admin/import | — | Bản ghi có provenance và quyền sử dụng |

## 5. Tiêu chí nghiệm thu giao diện (đo được)
- Ảnh chụp baseline mobile 390px và desktop 1280px cho từng màn hình, lưu `.local/`.
- Lighthouse mobile: Accessibility ≥ 95; Performance mục tiêu ≥ 85 trên trang public (đo trên build production).
- Không còn control mặc định chưa style; không còn CSS ngoài token cho màu/khoảng cách.
- Toàn bộ test BFF/Chromium hiện có vẫn PASS sau khi đổi giao diện.

## 6. Thứ tự và rủi ro
Thứ tự: T40 → T41 → T42/T43 → T44 → T45/T46 → T47 → T48. T49 chạy song song.

Rủi ro: vỡ selector test Chromium (ưu tiên role/label, không đổi nhãn tiếng Việt vô cớ); cài dependency trong sandbox cần offline store; thiếu media làm trang chi tiết nghèo.

## 7. Cần người dùng xác nhận
1. Duyệt ADR 0024 và cho phép cài dependency (T40).
2. Màu nhấn/tên thương hiệu/logo có sẵn chưa; nếu chưa, đề xuất cam-đỏ + nền trắng.
3. Có cần dark mode ngay hay để T48.
4. Danh sách media sắp cung cấp và quyền sử dụng.

## 8. Trạng thái thực thi

- 2026-11-08: T40 IN_PROGRESS (chưa DONE). Tìm được Node v24.22.1 và pnpm 11.25.0 trong runtime Codex (`C:\Users\pan\.cache\codex-runtimes\codex-primary-runtime\dependencies`), chỉ thêm vào PATH của từng lệnh, không cài global.
- Đã pin: tailwindcss/@tailwindcss/postcss 4.3.5, postcss 8.5.32, clsx 2.1.1, tailwind-merge 3.7.0, class-variance-authority 0.7.1, lucide-react 1.70.0, @radix-ui/react-slot 1.5.0 (`frontend/package.json` + lockfile). Motion, TanStack Query, Zustand, RHF, Zod chưa cài; thêm khi task cần.
- Đã làm: `postcss.config.mjs`, `app/globals.css` (token), `lib/utils.ts`, `components/ui/button.tsx`, đổi bảng màu `style.css` sang trung tính + cam, header sticky + footer trong `layout.tsx`.
- Kiểm tra: build web PASS (`.local/ui-t40-build.log`); Chromium `tests/browser/public.spec.mjs` 9/9 PASS gồm WCAG tự động (`.local/ui-t40-public.log`). NOT RUN: test Auth/CMS/workout, ảnh chụp, bảng `TECHNOLOGY_VERSIONS.md` chưa cập nhật, chưa đối chiếu tài liệu chính thức từng phiên bản.
