import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Stepper grande para cargar marcadores con una mano: [-] 6 [+].
 * El número también es un input numérico para tipear directo.
 */
export function ScoreStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  size = 'lg',
  className,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  size?: 'md' | 'lg';
  className?: string;
  label?: string;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)));
  const big = size === 'lg';
  return (
    <div className={cn('flex items-center gap-1.5', className)} aria-label={label}>
      <button
        type="button"
        aria-label="Restar"
        onClick={() => set(value - 1)}
        className={cn(
          'press focus-ring flex shrink-0 items-center justify-center rounded-xl bg-canvas-2 text-ink hover:bg-line',
          big ? 'h-12 w-12' : 'h-10 w-10',
        )}
      >
        <Minus className="h-5 w-5" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        min={min}
        max={max}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          set(Number.isNaN(n) ? 0 : n);
        }}
        className={cn(
          'focus-ring tabular w-14 shrink-0 rounded-xl bg-transparent text-center font-semibold text-ink',
          big ? 'h-12 text-[32px]' : 'h-10 text-2xl',
        )}
      />
      <button
        type="button"
        aria-label="Sumar"
        onClick={() => set(value + 1)}
        className={cn(
          'press focus-ring flex shrink-0 items-center justify-center rounded-xl bg-canvas-2 text-ink hover:bg-line',
          big ? 'h-12 w-12' : 'h-10 w-10',
        )}
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

/** Contador simple [-] 4 [+] para el wizard (canchas, sets, etc). */
export function Counter({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, Math.round(v * 100) / 100)));
  return (
    <div className={cn('inline-flex items-center rounded-[var(--radius-control)] border border-line bg-surface', className)}>
      <button
        type="button"
        aria-label="Menos"
        onClick={() => set(value - step)}
        className="press flex h-11 w-11 items-center justify-center rounded-l-[var(--radius-control)] text-ink hover:bg-canvas-2"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="tabular min-w-12 text-center text-lg font-semibold">{value}</span>
      <button
        type="button"
        aria-label="Más"
        onClick={() => set(value + step)}
        className="press flex h-11 w-11 items-center justify-center rounded-r-[var(--radius-control)] text-ink hover:bg-canvas-2"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
