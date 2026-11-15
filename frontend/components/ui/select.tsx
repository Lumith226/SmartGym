'use client';

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SelectContextValue {
  value?: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  disabled?: boolean;
  registerLabel: (value: string, label: React.ReactNode) => void;
  getLabel: (value: string) => React.ReactNode;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext() {
  const context = React.useContext(SelectContext);
  if (!context) {
    throw new Error('Select compound components must be used within <Select>');
  }
  return context;
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export function Select({
  value: controlledValue,
  defaultValue,
  onValueChange,
  open: controlledOpen,
  onOpenChange,
  disabled = false,
  children,
}: SelectProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState<string | undefined>(defaultValue);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isOpenControlled = controlledOpen !== undefined;
  const open = isOpenControlled ? controlledOpen : uncontrolledOpen;

  const labelsRef = React.useRef<Map<string, React.ReactNode>>(new Map());
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

  const registerLabel = React.useCallback((val: string, label: React.ReactNode) => {
    if (labelsRef.current.get(val) !== label) {
      labelsRef.current.set(val, label);
      forceUpdate();
    }
  }, []);

  const getLabel = React.useCallback((val: string) => {
    return labelsRef.current.get(val);
  }, []);

  const handleValueChange = React.useCallback(
    (newValue: string) => {
      if (!isControlled) {
        setUncontrolledValue(newValue);
      }
      onValueChange?.(newValue);
    },
    [isControlled, onValueChange],
  );

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!isOpenControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isOpenControlled, onOpenChange],
  );

  return (
    <SelectContext.Provider
      value={{
        value,
        onValueChange: handleValueChange,
        open,
        setOpen: handleOpenChange,
        disabled,
        registerLabel,
        getLabel,
      }}
    >
      <DropdownMenuPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        {children}
      </DropdownMenuPrimitive.Root>
    </SelectContext.Provider>
  );
}

export const SelectGroup = DropdownMenuPrimitive.Group;

export const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ className, children, ...props }, ref) => {
  const { disabled, open } = useSelectContext();

  return (
    <DropdownMenuPrimitive.Trigger asChild disabled={disabled}>
      <button
        ref={ref}
        type="button"
        className={cn(
          'flex min-h-9 h-9 items-center justify-between gap-2 rounded-xl border border-border bg-card/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer select-none [&>span]:line-clamp-1',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 opacity-50 transition-transform duration-200',
            open && 'rotate-180 opacity-90',
          )}
        />
      </button>
    </DropdownMenuPrimitive.Trigger>
  );
});
SelectTrigger.displayName = 'SelectTrigger';

export function SelectValue({
  placeholder,
  className,
}: {
  placeholder?: string;
  className?: string;
}) {
  const { value, getLabel } = useSelectContext();
  const label = value !== undefined ? getLabel(value) : undefined;

  return (
    <span className={cn('truncate', !label && 'text-muted-foreground font-normal', className)}>
      {label ?? placeholder ?? ''}
    </span>
  );
}

export const SelectContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & {
    position?: 'item-aligned' | 'popper';
  }
>(({ className, children, position = 'popper', sideOffset = 4, ...props }, ref) => {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-xl border border-border bg-card/95 p-1 text-card-foreground shadow-xl backdrop-blur-md duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className,
        )}
        {...props}
      >
        <div className="max-h-72 overflow-y-auto p-0.5">{children}</div>
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
});
SelectContent.displayName = 'SelectContent';

export const SelectLabel = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn('px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground', className)}
    {...props}
  />
));
SelectLabel.displayName = 'SelectLabel';

export const SelectItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    value: string;
  }
>(({ className, children, value: itemValue, disabled, ...props }, ref) => {
  const { value, onValueChange, registerLabel } = useSelectContext();
  const isSelected = value === itemValue;

  React.useEffect(() => {
    registerLabel(itemValue, children);
  }, [itemValue, children, registerLabel]);

  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      disabled={disabled}
      onSelect={() => onValueChange(itemValue)}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center rounded-lg py-1.5 pl-8 pr-2.5 text-xs font-medium outline-none transition-colors focus:bg-muted focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        isSelected && 'bg-muted/60 text-foreground font-semibold',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2.5 flex h-3.5 w-3.5 items-center justify-center">
        {isSelected && <Check className="h-4 w-4 text-primary" />}
      </span>
      <span className="truncate">{children}</span>
    </DropdownMenuPrimitive.Item>
  );
});
SelectItem.displayName = 'SelectItem';

export const SelectSeparator = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-border/60', className)}
    {...props}
  />
));
SelectSeparator.displayName = 'SelectSeparator';
