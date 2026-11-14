# ADR 0024 — Bộ công nghệ giao diện Web

Trạng thái: PROPOSED (2026-11-08). Chờ người dùng duyệt và bước pin phiên bản; chưa cài dependency.

## Bối cảnh
Giao diện hiện tại gần như chưa có thiết kế: `frontend/app/style.css` chỉ 171 dòng, không có design token, form dùng control mặc định. AGENTS.md yêu cầu đánh giá Tailwind CSS bằng ADR trước khi dùng. Người dùng đã chọn stack bên dưới (2026-11-08).

## Quyết định
| Nhu cầu | Lựa chọn | Ghi chú |
|---|---|---|
| Framework | Next.js 16.4.5 + React 19.3.1 + TypeScript | Giữ nguyên, không nâng. |
| Style | Tailwind CSS | Token qua CSS variables/theme; thay dần `style.css`. |
| Component | shadcn/ui (Radix) | Mã được copy vào repo, tự sở hữu; ưu tiên a11y. |
| Icon | Lucide | Thay emoji/ký tự mũi tên. |
| Animation | Motion | Chỉ dùng ở chuyển trang, danh sách, dialog; tôn trọng `prefers-reduced-motion`. |
| Server state | TanStack Query | Cho dashboard, lịch, nhật ký, thông báo (client component). |
| Client state | Zustand | Chỉ cho UI state cục bộ (filter, drawer, theme). Không lưu dữ liệu nhạy cảm. |
| Form | React Hook Form + Zod | Zod dùng cho UI; **hợp đồng nguồn vẫn là OpenAPI/AJV**, tránh hai nguồn sự thật. |

## Ràng buộc
- Trang public (thư viện, chi tiết bài tập) giữ Server Component để giữ SEO/sitemap; TanStack Query chỉ ở khu `/app` và `/admin`.
- Không thay BFF, cookie, CSRF, mTLS. Không đổi hợp đồng API.
- Mọi gói pin chính xác trong `frontend/package.json` + lockfile; ghi vào `docs/guides/TECHNOLOGY_VERSIONS.md` với trạng thái PINNED → BUILD_VERIFIED.
- Phiên bản Tailwind/shadcn/Motion/TanStack/Zustand/RHF/Zod/Lucide hiện NOT_PINNED; phải kiểm tài liệu chính thức đúng phiên bản và tương thích Next 16/React 19 trước khi pin.
- Cài đặt và kiểm tra offline theo `.npmrc`/pnpm store hiện có; không install global.

## Hệ quả
- Tăng kích thước bundle; theo dõi bằng ngân sách trong plan (LCP/JS).
- Có hai lớp validation (Zod UI, AJV BFF); test hợp đồng giữ nguyên làm chuẩn.
- Phải chạy lại test BFF và Chromium Auth/CMS/workout sau khi đổi giao diện vì selector/label thay đổi.

## Rủi ro
Motion + nhiều thư viện dễ làm giao diện nặng; shadcn sinh nhiều file. Giảm bằng cách thêm component theo nhu cầu, không thêm cả bộ.
