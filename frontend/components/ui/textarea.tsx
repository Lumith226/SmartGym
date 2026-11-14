import * as React from 'react';
import { cn } from '../../lib/utils';

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'block min-h-24 w-full resize-y rounded-md border border-border bg-background px-3.5 py-2.5 text-sm leading-relaxed text-foreground transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}
