'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

interface TooltipContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function Tooltip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <div
        className="relative inline-flex"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </div>
    </TooltipContext.Provider>
  );
}

export const TooltipTrigger = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('inline-flex', className)} {...props}>
      {children}
    </div>
  ),
);
TooltipTrigger.displayName = 'TooltipTrigger';

export const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { side?: 'top' | 'bottom' | 'left' | 'right' }
>(({ className, side = 'top', children, ...props }, ref) => {
  const context = React.useContext(TooltipContext);
  if (!context?.open) return null;

  const sideClasses = {
    top: 'bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2',
    bottom: 'top-[calc(100%+6px)] left-1/2 -translate-x-1/2',
    left: 'right-[calc(100%+6px)] top-1/2 -translate-y-1/2',
    right: 'left-[calc(100%+6px)] top-1/2 -translate-y-1/2',
  };

  return (
    <div
      ref={ref}
      role="tooltip"
      className={cn(
        'absolute z-50 whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1 text-[11px] font-medium text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 duration-100',
        sideClasses[side],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});
TooltipContent.displayName = 'TooltipContent';
