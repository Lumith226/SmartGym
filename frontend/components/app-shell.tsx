'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { cn } from '../lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const isChat = pathname === '/hoi-dap' || pathname.startsWith('/hoi-dap');
  const isAuth =
    pathname === '/dang-nhap' ||
    pathname === '/dang-ky' ||
    pathname === '/quen-mat-khau' ||
    pathname === '/dat-lai-mat-khau' ||
    pathname === '/xac-minh-email';

  if (isAdmin || isAuth) {
    // CMS Quản trị viên & Phân hệ Xác thực Auth: Giao diện độc lập hoàn toàn, không hiển thị thanh sidebar người dùng
    return (
      <main id="noi-dung-chinh" tabIndex={-1} className="min-h-dvh w-full bg-background">
        {children}
      </main>
    );
  }

  if (isChat) {
    // Chatbot RAG: Giữ thanh điều hướng sidebar hệ thống, không padding ngoài để giao diện chat tràn màn hình
    return (
      <div className="flex h-dvh w-full flex-col md:flex-row overflow-hidden bg-background">
        <Sidebar />
        <main id="noi-dung-chinh" tabIndex={-1} className="flex min-w-0 flex-1 h-full overflow-hidden">
          {children}
        </main>
      </div>
    );
  }

  const isStudio =
    pathname === '/bai-tap' ||
    pathname.startsWith('/bai-tap');
  if (isStudio) {
    // Thư viện bài tập: Tràn viền toàn màn hình đúng chuẩn Architectural Option A
    const isScrollable = true;
    return (
      <div className="flex h-dvh w-full flex-col md:flex-row overflow-hidden bg-background">
        <Sidebar />
        <main
          id="noi-dung-chinh"
          tabIndex={-1}
          className={cn(
            'flex min-w-0 flex-1 h-full flex-col bg-background',
            isScrollable ? 'overflow-y-auto' : 'overflow-hidden',
          )}
        >
          {children}
        </main>
      </div>
    );
  }

  // Giao diện người dùng Web App với Icon Rail bên trái (md+) & Header rút gọn (Mobile)
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main
          id="noi-dung-chinh"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1460px] flex-1 px-3 py-5 sm:px-6 sm:py-7 lg:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
