export { formatMinutes, formatPoints, signed, formatDuration, formatTime, formatDate } from './format';

export function formatRelative(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return `hace ${h}h ${(m % 60).toString().padStart(2, '0')}m`;
}
