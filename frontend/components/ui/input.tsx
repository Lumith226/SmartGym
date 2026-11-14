import * as React from 'react';
import { cn } from '../../lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        spellCheck={false}
        autoComplete="off"
        data-gramm="false"
        {...({ writingsuggestions: 'false' } as any)}
        className={cn(
          'flex min-h-11 w-full rounded-md border border-border bg-card px-3.5 py-2 text-sm text-foreground shadow-2xs transition-colors placeholder:text-[#86868b] hover:border-[#86868b] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';


