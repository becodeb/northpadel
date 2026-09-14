import { Search, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { restMs, STATUS_LABELS, type Availability, type Player } from '@domain';
import { AddPlayerDialog } from '@/components/tournament/dialogs';
import { StatusDot } from '@/components/tournament/waiting-list';
import { Button } from '@/components/ui/button';
import { Card, Input, NativeSelect } from '@/components/ui/primitives';
import { playerStatus } from '@/lib/derived';
import { formatMinutes, formatPoints } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useEvent } from './event-context';

export function EventPlayersPage() {
  const { state, derived, now, run, openPlayer } = useEvent();
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const isTeam = state.config.mode === 'fixed_pairs';

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    return state.players
      .filter((p) => !q || p.name.toLocaleLowerCase('es').includes(q))
      .map((p) => {
        const competitorId = isTeam ? (p.teamId ?? p.id) : p.id;
        const s = derived.stats.byId[competitorId];
        return { p, s, status: playerStatus(state, derived, p, now), rank: derived.rankOf[competitorId], rest: s ? restMs(state, s, now) : 0 };
      })
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.p.name.localeCompare(b.p.name, 'es'));
  }, [state, derived, now, query, isTeam]);

  const counts = useMemo(() => {
    const c = { playing: 0, next: 0, available: 0, resting: 0, paused: 0, absent: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar jugador…" className="pl-10" />
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus className="h-4 w-4" />
          {isTeam ? 'Agregar pareja' : 'Agregar jugador'}
        </Button>
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto text-[12px]">
        {(['playing', 'next', 'available', 'resting', 'paused', 'absent'] as const).map((k) => (
          <span key={k} className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-muted shadow-card">
            <StatusDot status={k} />
            {STATUS_LABELS[k]} <b className="tabular text-ink">{counts[k]}</b>
          </span>
        ))}
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="px-4 py-2.5 font-semibold">#</th>
              <th className="px-2 py-2.5 font-semibold">Jugador</th>
              <th className="tabular px-2 py-2.5 text-right font-semibold">PJ</th>
              <th className="tabular px-2 py-2.5 text-right font-semibold">PTS</th>
              <th className="hidden px-2 py-2.5 font-semibold md:table-cell">Estado</th>
              <th className="hidden px-4 py-2.5 text-right font-semibold md:table-cell">Descanso</th>
              <th className="px-3 py-2.5 text-right font-semibold">Disponibilidad</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, s, status, rank, rest }) => (
              <tr key={p.id} className={cn('border-t border-line-2', (status === 'absent' || status === 'paused') && 'text-muted')}>
                <td className="tabular px-4 py-2 text-muted">{rank ?? '—'}</td>
                <td className="px-2 py-2">
                  <button onClick={() => openPlayer(p.id)} className="press flex items-center gap-2 text-left font-medium hover:text-north-ink">
                    <StatusDot status={status} className="md:hidden" />
                    <span className="truncate">{p.name}</span>
                    {p.level && <span className="text-[11px] text-muted">N{p.level}</span>}
                    {isTeam && p.teamId && <span className="text-[11px] text-muted">· {derived.stats.byId[p.teamId]?.name}</span>}
                  </button>
                </td>
                <td className="tabular px-2 py-2 text-right">{s?.matchesPlayed ?? 0}</td>
                <td className="tabular px-2 py-2 text-right font-semibold">{formatPoints(s?.points ?? 0)}</td>
                <td className="hidden px-2 py-2 md:table-cell">
                  <span className="flex items-center gap-2">
                    <StatusDot status={status} />
                    {STATUS_LABELS[status]}
                  </span>
                </td>
                <td className="tabular hidden px-4 py-2 text-right text-muted md:table-cell">
                  {status === 'available' || status === 'resting' ? formatMinutes(rest) : '—'}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <AvailabilitySelect player={p} onChange={(a) => run({ type: 'set_availability', playerId: p.id, availability: a })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-8 text-center text-[14px] text-muted">Sin resultados.</p>}
      </Card>
      <AddPlayerDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function AvailabilitySelect({ player, onChange }: { player: Player; onChange: (a: Availability) => void }) {
  return (
    <NativeSelect
      value={player.availability}
      onChange={(e) => onChange(e.target.value as Availability)}
      className={cn('h-9 w-36 text-[13px]', player.availability !== 'active' && 'text-muted')}
      aria-label={`Disponibilidad de ${player.name}`}
    >
      <option value="active">Disponible</option>
      <option value="paused">Pausado</option>
      <option value="absent">Ausente</option>
    </NativeSelect>
  );
}
