import { Dialog as RadixDialog, DropdownMenu as RadixMenu, Switch as RadixSwitch } from 'radix-ui';
import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Card ───────────────────────────────────────────────────────────────────

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('card', className)} {...props} />
));
Card.displayName = 'Card';

// ─── Badge ──────────────────────────────────────────────────────────────────

const badgeTones = {
  neutral: 'bg-canvas-2 text-muted',
  ink: 'bg-ink text-white',
  north: 'bg-north-soft text-north-ink',
  magenta: 'bg-magenta-soft text-magenta-ink',
  amber: 'bg-amber-soft text-amber-ink',
  danger: 'bg-danger-soft text-danger',
  outline: 'border border-line text-muted',
} as const;

export function Badge({
  tone = 'neutral',
  className,
  children,
  dot,
}: {
  tone?: keyof typeof badgeTones;
  className?: string;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        badgeTones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// ─── Inputs ─────────────────────────────────────────────────────────────────

export const inputClass =
  'focus-ring h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted-2 disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputClass, className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(inputClass, 'h-auto min-h-28 py-3 leading-relaxed', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(inputClass, 'appearance-none pr-9', className)}
        {...props}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  ),
);
NativeSelect.displayName = 'NativeSelect';

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>}
      {children}
      {error ? (
        <span className="mt-1.5 block text-[13px] text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[13px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

// ─── Switch ─────────────────────────────────────────────────────────────────

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex cursor-pointer items-center justify-between gap-4 py-1', disabled && 'opacity-50')}>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-[15px] font-medium text-ink">{label}</span>}
          {description && <span className="block text-[13px] text-muted">{description}</span>}
        </span>
      )}
      <RadixSwitch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="focus-ring relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors data-[state=checked]:bg-north"
      >
        <RadixSwitch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[22px]" />
      </RadixSwitch.Root>
    </label>
  );
}

// ─── Segmented control ──────────────────────────────────────────────────────

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={cn('inline-flex rounded-[var(--radius-control)] bg-canvas-2 p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'press focus-ring flex-1 whitespace-nowrap rounded-[9px] px-3 font-medium text-muted transition-colors',
            size === 'sm' ? 'h-8 text-[13px]' : 'h-10 text-sm',
            o.value === value && 'bg-surface text-ink shadow-card',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Modal (dialog en desktop, bottom sheet en mobile) ──────────────────────

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <RadixDialog.Content
          className={cn(
            'fixed z-50 flex max-h-[92dvh] flex-col bg-surface shadow-float outline-none',
            'inset-x-0 bottom-0 rounded-t-[22px] data-[state=open]:animate-rise-in',
            'md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[22px]',
            size === 'sm' && 'md:max-w-sm',
            size === 'md' && 'md:max-w-md',
            size === 'lg' && 'md:max-w-2xl',
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pt-5 md:px-6">
            <div className="min-w-0">
              <RadixDialog.Title className="text-[17px] font-semibold leading-tight text-ink">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-[13px] text-muted">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{typeof title === 'string' ? title : 'Diálogo'}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close className="press focus-ring -mr-2 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-canvas-2 hover:text-ink">
              <X className="h-4 w-4" />
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6">{children}</div>
          {footer && <div className="safe-bottom border-t border-line-2 px-5 py-4 md:px-6">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

// ─── Dropdown menu ──────────────────────────────────────────────────────────

export const Menu = RadixMenu.Root;
export const MenuTrigger = RadixMenu.Trigger;

export function MenuContent({ children, align = 'end' }: { children: ReactNode; align?: 'start' | 'end' | 'center' }) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        align={align}
        sideOffset={6}
        className="z-50 min-w-52 rounded-2xl bg-surface p-1.5 shadow-float data-[state=open]:animate-rise-in"
      >
        {children}
      </RadixMenu.Content>
    </RadixMenu.Portal>
  );
}

export function MenuItem({
  children,
  onSelect,
  danger,
  disabled,
  icon,
}: {
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <RadixMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 py-2.5 text-[15px] outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-canvas-2',
        danger ? 'text-danger' : 'text-ink',
      )}
    >
      {icon && <span className="text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
    </RadixMenu.Item>
  );
}

export function MenuSeparator() {
  return <RadixMenu.Separator className="my-1 h-px bg-line-2" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <RadixMenu.Label className="eyebrow px-3 pb-1 pt-2">{children}</RadixMenu.Label>;
}

// ─── Misc ───────────────────────────────────────────────────────────────────

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink', className)} />;
}

export function EmptyState({ title, description, action, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted-2 [&>svg]:h-8 [&>svg]:w-8">{icon}</div>}
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-xs text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <h2 className="eyebrow">{children}</h2>
      {right}
    </div>
  );
}
