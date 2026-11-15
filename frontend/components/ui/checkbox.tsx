'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, defaultChecked, onChange, onCheckedChange, disabled, ...props }, ref) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked ?? false);
    const isControlled = checked !== undefined;
    const isChecked = isControlled ? checked : internalChecked;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isControlled) {
        setInternalChecked(e.target.checked);
      }
      onChange?.(e);
      onCheckedChange?.(e.target.checked);
    };

    return (
      <label
        className={cn(
          'group relative inline-flex size-4.5 shrink-0 cursor-pointer items-center justify-center rounded-md border border-input shadow-xs transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          isChecked ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted/50 border-border',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
      >
        <input
          ref={ref}
          type="checkbox"
          checked={isChecked}
          disabled={disabled}
          onChange={handleChange}
          className="sr-only"
          {...props}
        />
        {isChecked && <Check className="size-3.5 stroke-[2.5]" />}
      </label>
    );
  },
);
Checkbox.displayName = 'Checkbox';
