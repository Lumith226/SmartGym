'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useToastStore, type ToastType } from '../../lib/toast';
import { cn } from '../../lib/utils';

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="size-4.5 text-emerald-500 shrink-0" />,
  error: <AlertCircle className="size-4.5 text-rose-500 shrink-0" />,
  warning: <AlertCircle className="size-4.5 text-amber-500 shrink-0" />,
  info: <Info className="size-4.5 text-[#6366f1] shrink-0" />,
};

const borders: Record<ToastType, string> = {
  success: 'border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.15)]',
  error: 'border-rose-500/30 shadow-[0_0_20px_rgba(244,63,94,0.15)]',
  warning: 'border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.15)]',
  info: 'border-[#6366f1]/30 shadow-[0_0_20px_rgba(99,102,241,0.15)]',
};

export function Toaster() {
  const { toasts, removeToast } = useToastStore();

  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Thông báo hệ thống"
      className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-xl border bg-card/95 backdrop-blur-md p-3.5 text-foreground transition-all duration-200 animate-in fade-in slide-in-from-bottom-3',
            borders[t.type],
          )}
        >
          <span className="mt-0.5">{icons[t.type]}</span>
          <div className="flex-1 min-w-0 pr-1">
            <h4 className="text-xs font-semibold tracking-tight">{t.title}</h4>
            {t.description && (
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                {t.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => removeToast(t.id)}
            aria-label="Đóng thông báo"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
