export const MINUTE = 60_000;
export const SECOND = 1_000;

export function minutesBetween(from: number, to: number): number {
  return Math.max(0, Math.round((to - from) / MINUTE));
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / MINUTE));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export function formatRelativeMinutes(ms: number): string {
  const m = Math.floor(ms / MINUTE);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return `hace ${h}h ${(m % 60).toString().padStart(2, '0')}m`;
}
