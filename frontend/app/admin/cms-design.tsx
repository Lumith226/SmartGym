import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '../../lib/utils';

export function CmsHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 pb-1">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}

export const cmsAction =
  'inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-[0_0_15px_rgba(99,102,241,0.25)] hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer';

export const cmsPanel =
  'rounded-xl border border-border bg-card shadow-xs';

export const cmsFilter =
  cmsPanel + ' flex flex-wrap items-end gap-3 p-3.5 sm:p-4';

export const cmsInput =
  'block h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-colors';

export const cmsTableHead =
  'border-b border-border bg-muted/60 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';

const tones = {
  blue: 'bg-primary/10 text-primary border border-primary/20',
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20',
};

export function CmsStat({
  label,
  value,
  icon,
  href,
  tone = 'blue',
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  href?: string;
  tone?: keyof typeof tones;
}) {
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg [&>svg]:size-[17px] transition-transform duration-150 group-hover:scale-105',
          tones[tone],
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <strong className="mt-0.5 block text-xl font-bold font-mono tracking-tight text-foreground tabular-nums">
          {value}
        </strong>
      </span>
    </>
  );

  const style =
    cmsPanel +
    ' group flex min-h-20 items-center gap-3.5 px-3.5 py-3 sm:px-4 transition-all duration-150 hover:border-primary/40 hover:shadow-sm';

  return href ? (
    <Link href={href} className={style}>
      {content}
    </Link>
  ) : (
    <div className={style}>{content}</div>
  );
}
