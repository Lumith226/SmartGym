'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  CircleHelp,
  ChevronRight,
  LogIn,
  LogOut,
  Search,
  Settings,
  Sparkles,
  User,
  UserPlus,
} from 'lucide-react';
import { useUiStore } from '../lib/ui-store';
import { cn } from '../lib/utils';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  roles: string[];
  timeZone?: string;
  createdAt?: string;
}

interface UserMenuProps {
  align?: 'side' | 'bottom';
  className?: string;
}

export function UserMenu({ align = 'side', className }: UserMenuProps) {
  const pathname = usePathname();
  const { setSearchOpen } = useUiStore();
  const [open, setOpen] = React.useState(false);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [loggingOut, setLoggingOut] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Lấy thông tin phiên đăng nhập
  const fetchProfile = React.useCallback(() => {
    fetch('/api/v1/me', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'include',
    })
      .then(async res => {
        if (res.ok) {
          const data = (await res.json()) as UserProfile;
          setProfile(data);
        } else {
          setProfile(null);
        }
      })
      .catch(() => {
        setProfile(null);
      });
  }, []);

  React.useEffect(() => {
    fetchProfile();
    const handleAuthChange = () => fetchProfile();
    window.addEventListener('smartgym:auth-changed', handleAuthChange);
    return () => {
      window.removeEventListener('smartgym:auth-changed', handleAuthChange);
    };
  }, [fetchProfile, pathname]);

  // Khi người dùng bấm mở menu, tải lại thông tin mới nhất
  React.useEffect(() => {
    if (open) fetchProfile();
  }, [open, fetchProfile]);

  // Đóng menu khi chuyển trang
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Bắt sự kiện bấm ra ngoài và bấm phím Escape
  React.useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SmartGym-CSRF': '1',
        },
        body: '{}',
      });
    } catch {
      // Bỏ qua lỗi mạng khi logout
    }
    setOpen(false);
    window.location.replace('/dang-nhap');
  }

  const isLoggedIn = Boolean(profile);
  const displayName = profile?.displayName || (isLoggedIn ? 'Người tập' : 'Khách');
  const userRole = profile?.roles?.includes('ADMIN')
    ? 'Quản trị viên'
    : isLoggedIn
      ? 'Hội viên Plus'
      : 'Chưa đăng nhập';

  // Lấy ký tự viết tắt đại diện cho avatar (VD: pan -> PA, Nguyen Van A -> NA)
  const initials = React.useMemo(() => {
    if (!profile?.displayName) return isLoggedIn ? 'PA' : null;
    const parts = profile.displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return profile.displayName.slice(0, 2).toUpperCase();
  }, [profile?.displayName, isLoggedIn]);

  const isActiveAccount =
    pathname === '/app' ||
    pathname.startsWith('/app/') ||
    pathname === '/dang-nhap' ||
    pathname === '/dang-ky';

  return (
    <div ref={menuRef} className={cn('relative inline-flex', className)}>
      {/* Nút bấm Avatar kích hoạt Dropdown */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-label="Tài khoản và cài đặt"
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'group relative flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full text-[11px] font-bold tracking-tight transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1] shadow-xs hover:scale-105',
          'bg-gradient-to-br from-[#e2e8f0] to-[#cbd5e1] text-[#0f172a] border border-[#cbd5e1] hover:border-[#4f46e5] dark:from-[#1e2433] dark:to-[#293247] dark:text-[#f1f3f9] dark:border-[#333a4f] dark:hover:border-[#6366f1]',
          open && 'ring-2 ring-[#6366f1] scale-105',
        )}
      >
        <span>{initials || 'SG'}</span>

        {/* Tooltip hiển thị khi rê chuột (chỉ hiện khi menu đang đóng) */}
        {!open && (
          <span
            role="tooltip"
            className="pointer-events-none absolute left-[calc(100%+12px)] z-50 hidden whitespace-nowrap rounded-md bg-[#0f172a] px-2.5 py-1 text-[11.5px] font-semibold text-white opacity-0 shadow-xl transition-all duration-150 group-hover:opacity-100 border border-[#334155] md:block dark:bg-[#161821] dark:border-[#333a4f]"
          >
            {isLoggedIn ? displayName : 'Đăng nhập / Đăng ký'}
          </span>
        )}
      </button>

      {/* Menu Popup Card chuẩn hiện đại kiểu Codex / ChatGPT */}
      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className={cn(
            'absolute z-50 w-[275px] rounded-2xl border border-border/80 bg-popover/95 p-2 text-popover-foreground shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-150',
            align === 'side'
              ? 'bottom-2 left-[calc(100%+16px)] origin-bottom-left'
              : 'right-0 top-[calc(100%+12px)] origin-top-right',
          )}
        >
          {/* Header Thông tin người dùng */}
          <div className="flex items-center gap-3.5 px-3 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1c1c1f] text-xs font-bold text-white shadow-xs ring-1 ring-white/10 dark:bg-[#27272a]">
              {initials || <User size={18} />}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14px] font-semibold text-foreground">
                {displayName}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                {isLoggedIn && <Sparkles size={12} className="text-amber-500" />}
                <span>{userRole}</span>
              </span>
            </div>
          </div>

          <div className="my-1.5 h-px bg-border/60" aria-hidden="true" />

          {/* Danh sách mục menu */}
          <div className="flex flex-col gap-1">
            {isLoggedIn ? (
              <>
                <Link
                  href="/app"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl bg-primary/10 px-3 py-2.5 text-[13.5px] font-semibold text-primary no-underline transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  <User size={17} className="shrink-0" />
                  <span>Tài khoản của tôi</span>
                </Link>

                <Link
                  href="/app/ho-so"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium text-foreground/90 no-underline transition-colors hover:bg-accent hover:text-foreground"
                >
                  <User size={17} className="shrink-0 text-muted-foreground" />
                  <span>Hồ sơ cá nhân</span>
                </Link>

                <Link
                  href="/app/tien-do"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium text-foreground/90 no-underline transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Activity size={17} className="shrink-0 text-muted-foreground" />
                  <span>Tiến độ tập luyện</span>
                </Link>

                <Link
                  href="/app/cai-dat/thong-bao"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-[13.5px] font-medium text-foreground/90 no-underline transition-colors hover:bg-accent hover:text-foreground"
                >
                  <div className="flex items-center gap-3">
                    <Settings size={17} className="shrink-0 text-muted-foreground" />
                    <span>Cài đặt thông báo</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Ctrl+,</span>
                </Link>

                <Link
                  href="/hoi-dap"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-[13.5px] font-medium text-foreground/90 no-underline transition-colors hover:bg-accent hover:text-foreground"
                >
                  <div className="flex items-center gap-3">
                    <CircleHelp size={17} className="shrink-0 text-muted-foreground" />
                    <span>Trợ giúp & Hỏi đáp</span>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </Link>

                <div className="my-1.5 h-px bg-border/60" aria-hidden="true" />

                <button
                  type="button"
                  role="menuitem"
                  disabled={loggingOut}
                  onClick={handleLogout}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium text-red-600 no-underline transition-colors hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  <LogOut size={17} className="shrink-0" />
                  <span>{loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}</span>
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/dang-nhap"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl bg-primary/10 px-3 py-2.5 text-[13.5px] font-semibold text-primary no-underline transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  <LogIn size={17} className="shrink-0" />
                  <span>Đăng nhập</span>
                </Link>

                <Link
                  href="/dang-ky"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium text-foreground/90 no-underline transition-colors hover:bg-accent hover:text-foreground"
                >
                  <UserPlus size={17} className="shrink-0 text-muted-foreground" />
                  <span>Đăng ký tài khoản</span>
                </Link>

                <div className="my-1.5 h-px bg-border/60" aria-hidden="true" />

                <Link
                  href="/hoi-dap"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-[13.5px] font-medium text-foreground/90 no-underline transition-colors hover:bg-accent hover:text-foreground"
                >
                  <div className="flex items-center gap-3">
                    <CircleHelp size={17} className="shrink-0 text-muted-foreground" />
                    <span>Trợ giúp & Hỏi đáp</span>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </Link>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    setSearchOpen(true);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium text-foreground/90 no-underline transition-colors hover:bg-accent hover:text-foreground"
                >
                  <div className="flex items-center gap-3">
                    <Search size={17} className="shrink-0 text-muted-foreground" />
                    <span>Tìm bài tập</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">⌘K</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
