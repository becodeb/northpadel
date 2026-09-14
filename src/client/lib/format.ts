import { MINUTE } from '@domain';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** "Juan Pérez" → "Juan P." (para listas compactas). */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

export function formatDateTime(ts: number): string {
  return `${formatDate(ts)} · ${formatTime(ts)}`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / MINUTE));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export function formatMinutes(ms: number): string {
  const m = Math.max(0, Math.floor(ms / MINUTE));
  if (m < 60) return `${m} min`;
  return formatDuration(ms);
}

export function dayLabel(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const n = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(n) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays === -1) return 'Mañana';
  return d
    .toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: d.getFullYear() !== n.getFullYear() ? 'numeric' : undefined })
    .replace('.', '')
    .toUpperCase();
}

export function formatPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

export function signed(n: number): string {
  if (n > 0) return `+${formatPoints(n)}`;
  return formatPoints(n);
}
