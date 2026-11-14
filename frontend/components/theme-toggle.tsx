'use client';

import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '../lib/utils';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'smartgym.theme';
const ORDER: ThemeMode[] = ['light', 'dark', 'system'];
const LABELS: Record<ThemeMode, string> = {
  light: 'Giao diện sáng',
  dark: 'Giao diện tối',
  system: 'Theo hệ thống',
};

/** Script chạy trước khi vẽ trang để không bị nháy sai màu khi tải. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

function applyTheme(mode: ThemeMode) {
  const dark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function useTheme() {
  const [mode, setMode] = React.useState<ThemeMode>('system');

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (saved && ORDER.includes(saved)) setMode(saved);
    } catch {}
  }, []);

  React.useEffect(() => {
    if (mode !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [mode]);

  const update = React.useCallback((next: ThemeMode) => {
    setMode(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const cycle = React.useCallback(() => {
    update(ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]);
  }, [mode, update]);

  return { mode, update, cycle };
}

/** Nút đổi giao diện sáng → tối → theo hệ thống. */
export function ThemeToggle({
  className,
  withTooltip = false,
}: {
  className?: string;
  withTooltip?: boolean;
}) {
  const { mode, cycle } = useTheme();
  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${LABELS[mode]} (bấm để đổi)`}
      title={LABELS[mode]}
      className={cn(
        'group relative inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-[12px] border border-border/60 bg-muted/60 text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground dark:border-border/40 dark:bg-muted/40',
        className,
      )}
    >
      <Icon size={19} strokeWidth={1.75} />
      {withTooltip && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-[calc(100%+12px)] z-50 whitespace-nowrap rounded-md bg-[#0f172a] px-2.5 py-1 text-[11.5px] font-semibold text-white opacity-0 shadow-xl transition-all duration-150 group-hover:opacity-100 border border-[#334155] dark:bg-[#161821] dark:border-[#333a4f]"
        >
          {LABELS[mode]}
        </span>
      )}
    </button>
  );
}
