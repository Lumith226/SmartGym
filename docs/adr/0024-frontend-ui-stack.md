# ADR 0024 — Bộ công nghệ giao diện Web

**Trạng thái** — `ACCEPTED` cho bộ công nghệ đang dùng trong Web. Căn cứ là lựa chọn giao diện đã ghi ngày 2026-11-08 và các gói, component đang có trong repository.

## Bối cảnh và phương án

Web và CMS cần dùng chung token giao diện, control có thể tái sử dụng và quy tắc truy cập bằng bàn phím. CSS riêng cho từng trang làm giao diện dễ lệch. Một bộ UI đầy đủ giảm thời gian dựng màn hình nhưng đưa thêm thành phần và quy tắc phụ thuộc vào thư viện.

## Quyết định

| Phạm vi | Lựa chọn và bằng chứng trong repo |
|---|---|
| Framework | Next.js App Router, React và TypeScript theo [manifest](../../frontend/package.json). |
| Style | Tailwind CSS và CSS variables trong [globals.css](../../frontend/app/globals.css). |
| Component | Web sở hữu mã trong [components/ui](../../frontend/components/ui/), dùng Radix cho những primitive như Dialog và Slot. Đây là cách tổ chức theo shadcn/ui với component được quản lý trong repository. |
| Icon | Lucide qua manifest Web, dùng cùng accessible name trên nút chỉ có icon. |
| State | State cục bộ trong React và Zustand cho UI dùng chung như [UI store](../../frontend/lib/ui-store.ts) và [toast](../../frontend/lib/toast.ts). Dữ liệu server theo cách fetch/cache của từng route trong [kiến trúc frontend](../design/FRONTEND_ARCHITECTURE.md). TanStack Query từng được đề xuất, chưa có trong manifest. |
| Form | React Hook Form và Zod ở các form đã áp dụng, ví dụ [sidebar](../../frontend/components/sidebar.tsx). OpenAPI và AJV tiếp tục kiểm hợp đồng ở BFF. |

Motion có trong manifest. Việc áp dụng animation theo từng màn hình phụ thuộc nhu cầu và yêu cầu giảm chuyển động của người dùng.

## Hệ quả và điều kiện xem xét lại

Component nội bộ cần tự duy trì style, hành vi bàn phím và trạng thái lỗi. Ưu tiên tái sử dụng component đã có. Cách lấy dữ liệu trang công khai, SEO và server rendering theo thiết kế Web. Khi thay primitive hoặc cách quản lý server state, kiểm lại bundle, thao tác bàn phím và hồi quy các luồng Web/CMS liên quan. Tra phiên bản exact ở [manifest](../../frontend/package.json) và [lockfile](../../pnpm-lock.yaml).
