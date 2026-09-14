import { restMs, STATUS_LABELS, type PlayerDisplayStatus } from '@domain';
import { Card, SectionTitle } from '@/components/ui/primitives';
import { playerStatus } from '@/lib/derived';
import { formatMinutes, formatPoints } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useEvent } from '@/pages/event/event-context';

const DOT: Record<PlayerDisplayStatus, string> = {
  playing: 'bg-north',
  next: 'bg-magenta',
  available: 'bg-ink',
  resting: 'bg-amber',
  paused: 'bg-muted-2',
  absent: 'bg-line',
};

export function StatusDot({ status, className }: { status: PlayerDisplayStatus; className?: string }) {
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', DOT[status], className)} title={STATUS_LABELS[status]} />;
}

/** Jugadores que no están en cancha, ordenados por tiempo de espera. */
export function WaitingList({ limit }: { limit?: number }) {
  const { state, derived, now, openPlayer } = useEvent();
  const isTeam = state.config.mode === 'fixed_pairs';

  const rows = state.players
    .map((p) => {
      const competitorId = isTeam ? (p.teamId ?? p.id) : p.id;
      const s = derived.stats.byId[competitorId];
      const status = playerStatus(state, derived, p, now);
      return { p, s, status, rest: s ? restMs(state, s, now) : 0 };
    })
    .filter((r) => r.status !== 'playing' && r.status !== 'next')
    .sort((a, b) => {
      const order = (st: PlayerDisplayStatus) => (st === 'available' ? 0 : st === 'resting' ? 1 : st === 'paused' ? 2 : 3);
      return order(a.status) - order(b.status) || b.rest - a.rest;
    });

  const shown = limit ? rows.slice(0, limit) : rows;

  return (
    <section>
      <SectionTitle right={<span className="text-[12px] text-muted">{rows.filter((r) => r.status === 'available' || r.status === 'resting').length} esperando</span>}>
        En espera
      </SectionTitle>
      <Card>
        {shown.length === 0 ? (
          <p className="px-4 py-5 text-[14px] text-muted">Todos están jugando.</p>
        ) : (
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-semibold">Jugador</th>
                <th className="tabular px-2 py-2.5 text-right font-semibold">PJ</th>
                <th className="tabular px-2 py-2.5 text-right font-semibold">PTS</th>
                <th className="tabular px-4 py-2.5 text-right font-semibold">Descanso</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ p, s, status, rest }) => (
                <tr
                  key={p.id}
                  onClick={() => openPlayer(p.id)}
                  className={cn('cursor-pointer border-t border-line-2 hover:bg-canvas', (status === 'paused' || status === 'absent') && 'text-muted')}
                >
                  <td className="flex items-center gap-2.5 px-4 py-2.5">
                    <StatusDot status={status} />
                    <span className="truncate font-medium">{p.name}</span>
                    {status !== 'available' && <span className="text-[11px] text-muted">{STATUS_LABELS[status]}</span>}
                  </td>
                  <td className="tabular px-2 py-2.5 text-right">{s?.matchesPlayed ?? 0}</td>
                  <td className="tabular px-2 py-2.5 text-right font-semibold">{formatPoints(s?.points ?? 0)}</td>
                  <td className="tabular px-4 py-2.5 text-right text-muted">{status === 'absent' || status === 'paused' ? '—' : formatMinutes(rest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {limit && rows.length > limit && (
          <p className="border-t border-line-2 px-4 py-2 text-[12px] text-muted">+ {rows.length - limit} más en Jugadores</p>
        )}
      </Card>
    </section>
  );
}
