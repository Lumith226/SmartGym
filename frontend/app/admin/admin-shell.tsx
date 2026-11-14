'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowDownUp,
  ArrowLeft,
  Dumbbell,
  Image,
  Layers,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  Plus,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react';
import { ThemeToggle } from '../../components/theme-toggle';
import { LogoutButton } from '../auth/forms';
import { cn } from '../../lib/utils';

const navigation = [
  {
    title: 'Biên tập',
    items: [
      { href: '/admin', label: 'Tổng quan', icon: LayoutGrid },
      { href: '/admin/bai-tap', label: 'Kho bài tập', icon: Dumbbell },
      { href: '/admin/bai-tap/moi', label: 'Thêm bài tập', icon: Plus },
    ],
  },
  {
    title: 'Danh mục',
    items: [
      { href: '/admin/noi-dung/muscle-group', label: 'Nhóm cơ', icon: Layers },
      { href: '/admin/noi-dung/equipment', label: 'Dụng cụ', icon: Wrench },
      { href: '/admin/noi-dung/media', label: 'Media', icon: Image },
    ],
  },
  {
    title: 'Vận hành',
    items: [
      { href: '/admin/nhap-xuat', label: 'Nhập và xuất nội dung', icon: ArrowDownUp },
      { href: '/admin/nhat-ky', label: 'Nhật ký thay đổi', icon: ShieldCheck },
    ],
  },
];

const COLLAPSED_STORAGE_KEY = 'smartgym.cms.sidebarCollapsed';

function getBreadcrumb(pathname: string) {
  if (pathname === '/admin') return 'Biên tập / Tổng quan';
  if (pathname.startsWith('/admin/noi-dung/muscle-group')) return 'Danh mục / Nhóm cơ';
  if (pathname.startsWith('/admin/noi-dung/equipment')) return 'Danh mục / Dụng cụ';
  if (pathname.startsWith('/admin/noi-dung/media')) return 'Danh mục / Media';
  if (pathname === '/admin/bai-tap/moi') return 'Biên tập / Thêm bài tập';
  if (pathname.startsWith('/admin/bai-tap')) return 'Biên tập / Kho bài tập';
  if (pathname.startsWith('/admin/nhap-xuat')) return 'Vận hành / Nhập & Xuất';
  if (pathname.startsWith('/admin/nhat-ky')) return 'Vận hành / Nhật ký kiểm toán';
  return 'Quản trị nội dung';
}

export function AdminShell({
  displayName,
  email,
  children,
}: {
  displayName?: string;
  email?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const menuButton = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (saved !== null) setCollapsed(saved === 'true');
    } catch {}
  }, []);

  const toggleCollapse = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  React.useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        toggleCollapse();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCollapse]);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function closeMenu() {
    setMobileOpen(false);
    menuButton.current?.focus();
  }

  const breadcrumb = getBreadcrumb(pathname);

  return (
    <div className="cms-shell flex min-h-screen w-full bg-background text-foreground transition-colors duration-150 selection:bg-primary/25">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Đóng menu"
          onClick={closeMenu}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* LINEAR SIDEBAR (Hỗ trợ cả Sáng & Tối) */}
      <aside
        id="cms-sidebar"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && mobileOpen) closeMenu();
        }}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col justify-between overflow-y-auto border-r border-border bg-sidebar p-3 transition-[width] duration-200 ease-in-out lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:shrink-0',
          collapsed ? 'lg:w-[68px]' : 'lg:w-60',
          mobileOpen ? 'block w-60' : 'hidden lg:flex',
        )}
      >
        <div>
          {/* Header của Sidebar */}
          <div
            className={cn(
              'mb-6 flex min-h-9 items-center gap-2 border-b border-border/60 pb-3',
              collapsed ? 'justify-center px-0' : 'justify-between px-1',
            )}
          >
            {collapsed ? (
              <button
                type="button"
                onClick={toggleCollapse}
                title="Mở rộng thanh bên (Ctrl+B)"
                aria-label="Mở rộng thanh bên"
                className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_15px_rgba(99,102,241,0.35)] hover:opacity-90 transition-all cursor-pointer"
              >
                <Dumbbell className="size-4.5" />
              </button>
            ) : (
              <>
                <Link
                  href="/admin"
                  className="flex items-center gap-2.5 font-bold tracking-tight text-sm text-foreground no-underline"
                >
                  <span className="grid size-7.5 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_15px_rgba(99,102,241,0.35)]">
                    <Dumbbell className="size-4" />
                  </span>
                  <span className="truncate">SmartGym</span>
                  <span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[9px] font-semibold text-primary">
                    CMS
                  </span>
                </Link>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={toggleCollapse}
                    aria-label="Thu gọn thanh bên"
                    title="Thu gọn thanh bên (Ctrl+B)"
                    className="hidden lg:flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                  >
                    <PanelLeftClose className="size-4" />
                  </button>

                  <button
                    type="button"
                    onClick={closeMenu}
                    aria-label="Đóng điều hướng"
                    className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
                  >
                    <X className="size-5" />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Danh mục điều hướng */}
          <nav aria-label="Điều hướng CMS" className="space-y-5">
            {navigation.map((group) => (
              <div key={group.title} className="space-y-1">
                {collapsed ? (
                  <div
                    className="my-2 h-px bg-border/60 mx-1"
                    aria-hidden="true"
                  />
                ) : (
                  <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/75">
                    {group.title}
                  </p>
                )}

                {group.items.map(({ href, label, icon: Icon }) => {
                  const active =
                    pathname === href ||
                    (href === '/admin/bai-tap' &&
                      pathname.startsWith(href + '/') &&
                      pathname !== '/admin/bai-tap/moi');
                  return (
                    <Link
                      key={href}
                      href={href}
                      title={collapsed ? label : undefined}
                      aria-label={label}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg text-xs font-medium transition-all duration-150',
                        collapsed
                          ? 'h-9 w-9 mx-auto justify-center p-0'
                          : 'px-2.5 py-2',
                        active
                          ? 'bg-primary/15 text-primary font-semibold border border-primary/30 shadow-xs'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Chân Sidebar */}
        <div className="mt-6 space-y-2.5 border-t border-border pt-3">
          <Link
            href="/bai-tap"
            title={collapsed ? 'Về thư viện bài tập' : undefined}
            aria-label="Về thư viện bài tập"
            className={cn(
              'flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors',
              collapsed
                ? 'h-9 w-9 mx-auto justify-center rounded-lg hover:bg-accent p-0'
                : 'px-2.5 py-1.5',
            )}
          >
            <ArrowLeft className="size-3.5 shrink-0" />
            {!collapsed && <span>Về thư viện</span>}
          </Link>

          {collapsed ? (
            <button
              type="button"
              title="Đăng xuất"
              aria-label="Đăng xuất"
              onClick={async () => {
                try {
                  await fetch('/api/v1/auth/logout', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'x-smartgym-csrf': '1' },
                  });
                } finally {
                  window.location.replace('/dang-nhap');
                }
              }}
              className="flex h-9 w-9 mx-auto items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
            >
              <LogOut className="size-4 shrink-0" />
            </button>
          ) : (
            <div className="px-1">
              <LogoutButton />
            </div>
          )}
        </div>
      </aside>

      {/* Main CMS content area */}
      <div className="min-w-0 flex-1 flex flex-col bg-background">
        <header className="sticky top-0 z-30 flex h-13 items-center justify-between gap-4 border-b border-border bg-background/80 backdrop-blur-md px-4 sm:px-6">
          <div className="flex items-center gap-3">
            {/* Nút menu mở trên Mobile */}
            <button
              ref={menuButton}
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-expanded={mobileOpen}
              aria-controls="cms-sidebar"
              aria-label="Mở điều hướng"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden cursor-pointer"
            >
              <Menu className="size-5" />
            </button>

            {/* Breadcrumb kiểu Linear */}
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
              <span className="font-mono text-xs text-muted-foreground">
                {breadcrumb}
              </span>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              <kbd>Ctrl</kbd>+<kbd>B</kbd> để thu gọn
            </span>

            <ThemeToggle />

            {/* User Pill */}
            <div
              title={displayName || email}
              className="flex min-w-0 items-center gap-2.5 border-l border-border pl-3"
            >
              <span
                aria-hidden="true"
                className="grid size-7.5 shrink-0 place-items-center rounded-lg bg-primary/10 border border-primary/20 text-xs font-bold font-mono text-primary"
              >
                {(displayName || email || 'A').trim().slice(0, 1).toUpperCase()}
              </span>
              <div className="hidden sm:block leading-tight">
                <span className="block max-w-40 truncate text-xs font-semibold text-foreground">
                  {displayName || 'Quản trị viên'}
                </span>
                <span className="block max-w-40 truncate text-[10px] font-mono text-muted-foreground">
                  {email || 'admin@smartgym.vn'}
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
