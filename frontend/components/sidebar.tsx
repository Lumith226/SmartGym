'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Menu, Search, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ThemeToggle } from './theme-toggle';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { useUiStore } from '../lib/ui-store';
import { cn } from '../lib/utils';
import { UserMenu } from './user-menu';

const quickSearchSchema = z.object({
  q: z.string().trim().max(100),
});

type QuickSearchValues = z.infer<typeof quickSearchSchema>;

type RailItem = {
  href: string;
  label: string;
  svgPath: React.ReactNode;
};

/* ─── 5 Main Navigation Items chuẩn Option A (Linear Visual Poster Grid) ─── */
const optionARailItems: RailItem[] = [
  {
    href: '/',
    label: 'Phòng tập AI',
    svgPath: (
      <>
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </>
    ),
  },
  {
    href: '/ban-do-co-the',
    label: 'Bản đồ cơ thể 3D',
    svgPath: (
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    ),
  },
  {
    href: '/ke-hoach-tap',
    label: 'Kế hoạch tập',
    svgPath: (
      <>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </>
    ),
  },
  {
    href: '/bai-tap',
    label: 'Thư viện bài tập',
    svgPath: (
      <>
        <path d="m16 6 4 14" />
        <path d="M12 6v14" />
        <path d="M8 8v12" />
        <path d="M4 4v16" />
      </>
    ),
  },
  {
    href: '/cong-cu',
    label: 'Công cụ tính toán',
    svgPath: (
      <>
        <rect width="7" height="7" x="3" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="14" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" />
      </>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { searchOpen, setSearchOpen, toggleSearch } = useUiStore();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const form = useForm<QuickSearchValues>({
    resolver: zodResolver(quickSearchSchema),
    defaultValues: { q: '' },
  });

  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleSearch();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSearch]);

  function onSubmit(values: QuickSearchValues) {
    setSearchOpen(false);
    const q = values.q.trim();
    router.push(q ? '/bai-tap?q=' + encodeURIComponent(q) : '/bai-tap');
  }

  function isItemActive(href: string) {
    if (href === '/') return pathname === '/' || pathname.startsWith('/app/tap-ai');
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <>
      {/* Hộp thoại Tìm kiếm nhanh toàn cục (⌘K) */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="top-[14%] w-[calc(100vw-2rem)] translate-y-0 sm:top-[18%] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Tìm kiếm trên SmartGym</DialogTitle>
            <DialogDescription>
              Nhập tên bài tập, nhóm cơ hoặc dụng cụ tập luyện.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="!m-0 mt-2 flex flex-col gap-3 !border-0 !bg-transparent !p-0 !shadow-none"
          >
            <div className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-3.5 h-4 w-4 text-[#86868b]"
                aria-hidden="true"
              />
              <Input
                placeholder="Tìm bài tập (ví dụ: Squat, Chống đẩy, Plank)..."
                maxLength={100}
                autoFocus
                className="pl-10 text-base"
                {...form.register('q')}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#86868b]">
                <span>Liên kết nhanh:</span>
                {['Squat', 'Chống đẩy', 'Plank', 'Deadlift'].map(term => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      router.push('/bai-tap?q=' + encodeURIComponent(term));
                    }}
                    className="!min-h-0 cursor-pointer rounded-md !border-0 !bg-muted !px-2.5 !py-1 text-xs font-normal !text-foreground transition-colors hover:!bg-accent"
                  >
                    {term}
                  </button>
                ))}
              </div>
              <Button type="submit" size="sm">
                Tìm kiếm
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── SIDEBAR ICON RAIL (OPTION A: 62px FIXED) ─── */}
      <aside
        aria-label="Thanh điều hướng hệ thống"
        className="z-50 hidden w-[62px] min-w-[62px] shrink-0 flex-col items-center justify-between border-r border-[#e2e8f0] dark:border-[#232736] bg-white dark:bg-[#101217] py-3.5 select-none md:sticky md:top-0 md:flex md:h-dvh"
      >
        {/* 1. Đỉnh Sidebar: Brand Logo Option A + Vạch ngăn */}
        <div className="flex w-full flex-col items-center gap-3">
          <Link
            href="/"
            aria-label="SmartGym Home"
            className="group relative flex h-9 w-9 items-center justify-center rounded-[9px] bg-gradient-to-br from-[#6366f1] to-[#4338ca] text-white font-extrabold text-[13px] tracking-tight shadow-[0_4px_14px_rgba(99,102,241,0.28)] transition-all duration-200 hover:scale-[1.06] hover:shadow-[0_6px_18px_rgba(99,102,241,0.5)]"
          >
            SG
            <span
              role="tooltip"
              className="pointer-events-none absolute left-[calc(100%+12px)] z-50 whitespace-nowrap rounded-md bg-[#0f172a] px-2.5 py-1 text-[11.5px] font-semibold text-white opacity-0 shadow-xl transition-all duration-150 group-hover:opacity-100 border border-[#334155] dark:bg-[#161821] dark:border-[#333a4f]"
            >
              SmartGym Home
            </span>
          </Link>

          {/* Vạch ngăn mảnh */}
          <div className="h-px w-7 bg-[#e2e8f0] dark:bg-[#232736]" />
        </div>

        {/* 2. Giữa Sidebar: Cụm 5 Navigation Icons được CĂN GIỮA THEO CHIỀU DỌC (Vertical Center) */}
        <nav className="my-auto flex w-full flex-col items-center justify-center gap-2">
          {optionARailItems.map(item => {
            const active = isItemActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex h-10 w-10 items-center justify-center rounded-[11px] border border-transparent no-underline transition-all duration-150',
                  active
                    ? 'bg-[rgba(79,70,229,0.08)] text-[#4f46e5] border-[rgba(79,70,229,0.25)] shadow-[inset_0_0_12px_rgba(79,70,229,0.08)] dark:bg-[rgba(99,102,241,0.14)] dark:text-[#6366f1] dark:border-[rgba(99,102,241,0.35)] dark:shadow-[inset_0_0_12px_rgba(99,102,241,0.15)]'
                    : 'text-[#64748b] hover:bg-[#eef2ff] hover:text-[#4338ca] dark:text-[#9098ac] dark:hover:bg-[rgba(99,102,241,0.14)] dark:hover:text-[#f1f3f9] dark:hover:border-[#1c202d]',
                )}
              >
                {/* Vạch chỉ báo Active sát mép ngoài cùng bên trái của Rail (không làm lệch icon bên trong) */}
                {active && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -left-[11px] top-2 bottom-2 w-[3px] rounded-r-full bg-[#4f46e5] shadow-[0_0_8px_rgba(79,70,229,0.5)] dark:bg-[#6366f1] dark:shadow-[0_0_8px_#6366f1]"
                  />
                )}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.85"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform duration-150 group-hover:scale-105"
                >
                  {item.svgPath}
                </svg>
                {/* Tooltip nổi bên phải */}
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-[calc(100%+12px)] z-50 whitespace-nowrap rounded-md bg-[#0f172a] px-2.5 py-1 text-[11.5px] font-semibold text-white opacity-0 shadow-xl transition-all duration-150 group-hover:opacity-100 border border-[#334155] dark:bg-[#161821] dark:border-[#333a4f]"
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* 3. Chân Sidebar: Hỏi đáp AI (RAG) + Theme Toggle + User Avatar Option A */}
        <div className="flex w-full flex-col items-center gap-3">
          {/* Hỏi đáp AI (Chatbot RAG) */}
          <Link
            href="/hoi-dap"
            aria-label="Hỏi đáp AI"
            className="group relative flex h-10 w-10 items-center justify-center rounded-[11px] border border-transparent text-[#6366f1] transition-all duration-150 hover:bg-[#eef2ff] hover:text-[#4338ca] dark:text-[#818cf8] dark:hover:bg-[rgba(99,102,241,0.14)] dark:hover:text-[#f1f3f9] dark:hover:border-[#1c202d]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.85"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-[calc(100%+12px)] z-50 whitespace-nowrap rounded-md bg-[#0f172a] px-2.5 py-1 text-[11.5px] font-semibold text-white opacity-0 shadow-xl transition-all duration-150 group-hover:opacity-100 border border-[#334155] dark:bg-[#161821] dark:border-[#333a4f]"
            >
              Hỏi đáp HLV AI (RAG)
            </span>
          </Link>

          {/* Theme Toggle Button */}
          <ThemeToggle
            withTooltip
            className="h-[38px] w-[38px] rounded-[10px] border border-[#e2e8f0] bg-[#f8fafc] text-[#64748b] shadow-xs hover:border-[#cbd5e1] hover:bg-[#eef2ff] hover:text-[#4338ca] dark:border-[#232736] dark:bg-[#191d28] dark:text-[#9098ac] dark:hover:border-[#6366f1] dark:hover:bg-[rgba(99,102,241,0.14)] dark:hover:text-[#f1f3f9]"
          />

          {/* User Avatar Option A (Gradient Slate + Green Online Dot) */}
          <div className="relative">
            <UserMenu align="side" />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#10b981] ring-2 ring-white dark:ring-[#101217]"
            />
          </div>
        </div>
      </aside>

      {/* ─── THANH HEADER RÚT GỌN TRÊN MOBILE (< 768px) ─── */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-sidebar/95 backdrop-blur-xl md:hidden">
        <div className="flex h-13 items-center justify-between px-4">
          <Link
            href="/"
            aria-label="SmartGym"
            className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.2em] text-foreground no-underline"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-gradient-to-br from-[#6366f1] to-[#4338ca] text-[11px] font-extrabold text-white shadow-xs">
              SG
            </span>
            <span>SMARTGYM</span>
          </Link>

          <div className="flex items-center gap-1">
            <ThemeToggle className="h-9 w-9" />
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Tìm kiếm"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-foreground hover:bg-accent"
            >
              <Search size={18} />
            </button>
            <UserMenu align="bottom" />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(v => !v)}
              aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở thanh chức năng'}
              aria-expanded={mobileMenuOpen}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-foreground hover:bg-accent"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav
            aria-label="Menu di động"
            className="flex flex-col gap-1 border-t border-border px-4 py-3 bg-sidebar"
          >
            {optionARailItems.map(item => {
              const active = isItemActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-[rgba(99,102,241,0.14)] text-[#6366f1] font-semibold dark:text-[#818cf8]'
                      : 'text-foreground/80 hover:bg-accent hover:text-foreground',
                  )}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.85"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {item.svgPath}
                  </svg>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        )}
      </header>
    </>
  );
}
