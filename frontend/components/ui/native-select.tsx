import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative min-w-0">
      <select
        data-slot="native-select"
        className={cn(
          'block min-h-11 w-full appearance-none rounded-md border border-border bg-background py-2 ps-3.5 pe-9 text-sm text-foreground transition-colors hover:border-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
          className,
        )}
        {...props}
      />
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
