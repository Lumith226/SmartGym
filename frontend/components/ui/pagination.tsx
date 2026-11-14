import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Pagination({
  className,
  ...props
}: React.ComponentProps<'nav'>) {
  return (
    <nav
      role="navigation"
      aria-label="Phân trang"
      data-slot="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  );
}

export function PaginationContent({
  className,
  ...props
}: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn('m-0 flex flex-row items-center gap-1.5 list-none p-0', className)}
      {...props}
    />
  );
}

export function PaginationItem({ ...props }: React.ComponentProps<'li'>) {
  return <li data-slot="pagination-item" className="m-0" {...props} />;
}

type PaginationLinkProps = {
  isActive?: boolean;
  disabled?: boolean;
} & React.ComponentProps<typeof Link>;

export function PaginationLink({
  className,
  isActive,
  disabled,
  ...props
}: PaginationLinkProps) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={cn(
          'inline-flex h-9 min-w-9 items-center justify-center rounded-sm border border-transparent bg-transparent px-3 text-xs font-semibold text-[#86868b]/50 select-none',
          className,
        )}
      >
        {props.children}
      </span>
    );
  }
  return (
    <Link
      aria-current={isActive ? 'page' : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        'inline-flex h-9 min-w-9 items-center justify-center rounded-sm border text-xs font-semibold no-underline transition-colors',
        isActive
          ? 'border-foreground bg-[#1d1d1f] text-white'
          : 'border-border bg-card text-foreground hover:bg-muted',
        className,
      )}
      {...props}
    />
  );
}

export function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Trang trước"
      className={cn('gap-1 px-3', className)}
      {...props}
    >
      <ChevronLeft size={14} aria-hidden="true" />
      <span>Trước</span>
    </PaginationLink>
  );
}

export function PaginationNext({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Trang sau"
      className={cn('gap-1 px-3', className)}
      {...props}
    >
      <span>Sau</span>
      <ChevronRight size={14} aria-hidden="true" />
    </PaginationLink>
  );
}

export function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      aria-hidden="true"
      data-slot="pagination-ellipsis"
      className={cn('flex h-9 w-9 items-center justify-center text-[#86868b]', className)}
      {...props}
    >
      <MoreHorizontal size={14} />
    </span>
  );
}

