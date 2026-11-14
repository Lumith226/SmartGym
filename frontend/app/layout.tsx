import type { Metadata } from 'next';
import { AppShell } from '../components/app-shell';
import { THEME_INIT_SCRIPT } from '../components/theme-toggle';
import { Toaster } from '../components/ui/toaster';
import './globals.css';

export const metadata: Metadata = {
  title: 'SmartGym — Phòng tập AI & Thư viện bài tập',
  description: 'Quay trực tiếp qua Camera hoặc gửi Video phân tích động tác bằng AI.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="scroll-smooth" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,400;0,500;1,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh overflow-x-hidden bg-background font-sans text-foreground antialiased has-[.cms-shell]:overflow-x-clip">
        <a
          href="#noi-dung-chinh"
          className="skip-link fixed left-2 top-2 z-50 -translate-y-[200%] rounded-md bg-[#0071e3] px-4 py-2 text-sm font-semibold text-white focus:translate-y-0"
        >
          Bỏ qua điều hướng
        </a>
        <AppShell>{children}</AppShell>
        <Toaster />
      </body>
    </html>
  );
}
