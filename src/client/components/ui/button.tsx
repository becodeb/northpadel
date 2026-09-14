import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'press focus-ring inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-medium disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-white hover:bg-ink-3',
        north: 'bg-north text-white hover:bg-north-deep',
        magenta: 'bg-magenta text-white hover:bg-magenta-deep',
        secondary: 'bg-canvas-2 text-ink hover:bg-line',
        outline: 'border border-line bg-surface text-ink hover:bg-canvas',
        ghost: 'text-ink hover:bg-canvas-2',
        subtle: 'text-muted hover:bg-canvas-2 hover:text-ink',
        danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-white',
      },
      size: {
        xs: 'h-8 px-2.5 text-[13px]',
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-[15px]',
        lg: 'h-13 px-5 text-base font-semibold',
        xl: 'h-14 px-6 text-[17px] font-semibold',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8',
        'icon-lg': 'h-12 w-12',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, loading, children, disabled, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
