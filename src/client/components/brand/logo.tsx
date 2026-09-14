import { cn } from '@/lib/utils';

/**
 * Isotipo North: una "N" construida con dos trazos en diagonal (turquesa y
 * fucsia), sobre fondo negro. Wordmark en Geist con tracking amplio.
 */
export function NorthMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="9" fill="#191919" />
      <path d="M9 23V9l4.2 0L23 20.2V9" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 23V9" stroke="#22B8B5" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M23 9v14" stroke="#E74383" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className, compact = false, light = false }: { className?: string; compact?: boolean; light?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <NorthMark size={compact ? 26 : 30} />
      <span className={cn('flex flex-col leading-none', light ? 'text-white' : 'text-ink')}>
        <span className={cn('font-bold tracking-[0.18em]', compact ? 'text-[13px]' : 'text-[15px]')}>NORTH</span>
        <span className={cn('font-medium tracking-[0.32em]', compact ? 'text-[9px]' : 'text-[10px]', light ? 'text-white/60' : 'text-muted')}>
          PADEL
        </span>
      </span>
    </span>
  );
}
