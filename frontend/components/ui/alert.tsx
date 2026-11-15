import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const alertVariants = cva(
  'relative w-full rounded-2xl border p-4 text-sm [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
  {
    variants: {
      variant: {
        default: 'bg-card text-foreground border-border',
        destructive: 'border-destructive/50 text-destructive bg-destructive/10 dark:border-destructive [&>svg]:text-destructive',
        success: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 [&>svg]:text-emerald-500',
        info: 'border-primary/30 text-primary bg-primary/10 [&>svg]:text-primary',
        warning: 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10 [&>svg]:text-amber-500',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = 'Alert';

export const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn('mb-1 font-semibold leading-none tracking-tight', className)} {...props} />
  ),
);
AlertTitle.displayName = 'AlertTitle';

export const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-xs [&_p]:leading-relaxed text-muted-foreground', className)} {...props} />
  ),
);
AlertDescription.displayName = 'AlertDescription';
