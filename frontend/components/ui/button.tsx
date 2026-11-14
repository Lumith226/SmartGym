import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60 active:scale-[0.98] cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs',
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs',
        dark: 'bg-foreground text-background hover:bg-foreground/85',
        secondary: 'border border-border bg-card text-foreground hover:bg-muted',
        outline: 'border border-border bg-transparent text-foreground hover:bg-foreground/5',
        ghost: 'text-foreground hover:bg-foreground/5 hover:text-primary',
        pill: 'bg-foreground/5 text-foreground hover:bg-foreground/10',
        link: 'text-primary underline-offset-4 hover:underline p-0 min-h-0',
      },
      size: {
        default: 'h-11 px-5 py-2',
        sm: 'min-h-8 h-8 px-3.5 text-xs',
        lg: 'min-h-12 h-12 px-7 text-base',
        icon: 'h-9 w-9 min-h-9 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };


