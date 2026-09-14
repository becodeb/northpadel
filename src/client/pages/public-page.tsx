import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { evaluateSets, formatScore, restMs, STATUS_LABELS } from '@domain';
import { Wordmark } from '@/components/brand/logo';
import { SideNames } from '@/components/tournament/names';
import { RankingTable } from '@/components/tournament/ranking-table';
import { StatusDot } from '@/components/tournament/waiting-list';
import { Badge, Card, Input, Segmented } from '@/components/ui/primitives';
import { playerStatus } from '@/lib/derived';
import { formatMinutes, formatPoints, formatTime, signed } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { EventContextValue } from './event/event-context';
import { PublicEventProvider } from './public-provider';

/** Vista pública para jugadores (QR): ranking, partidos, su próximo turno. */
export function PublicEventPage() {
  const { id = '' } = useParams();
  return (
    <div className="min-h-dvh bg-canvas">
      <PublicEventProvider
        id={id}
        fallback={(status, error) => (
          <div className="flex min-h-dvh items-center justify-center text-[14px] text-muted">{status === 'error' ? (error ?? 'No se encontró el torneo') : 'Cargando…'}</div>
        )}
      >
        {(ctx) => <PublicBoard ctx={ctx} />}
      </PublicEventProvider>
    </div>
  );
}

type Tab = 'ranking' | 'partidos' | 'resultados';

function PublicBoard({ ctx }: { ctx: EventContextValue }) {
  const { state, derived, now, openPlayer } = ctx;
  const storageKey = `np:me:${state.id}`;
  const [meId, setMeId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('ranking');

  useEffect(() => {
    try {
      if (meId) localStorage.setItem(storageKey, meId);
      else localStorage.removeItem(storageKey);
    } catch {
      /* noop */
    }
  }, [meId, storageKey]);

  const me = meId ? state.players.find((p) => p.id === meId) : null;
  const suggestions = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    if (!q) return [];
    return state.players.filter((p) => p.name.toLocaleLowerCase('es').includes(q)).slice(0, 6);
  }, [query, state.players]);

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-4">
      <header className="flex items-center justify-between">
        <Wordmark compact />
        {state.status === 'live' ? (
          <Badge tone="north" dot>
            En vivo
          </Badge>
        ) : state.status === 'finished' ? (
          <Badge tone="neutral">Finalizado</Badge>
        ) : (
          <Badge tone="ink">Por comenzar</Badge>
        )}
      </header>
      <h1 className="mt-4 text-[22px] font-bold tracking-tight">{state.config.name}</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        {derived.finishedCount} partidos · {state.players.length} jugadores
      </p>

      {/* Mi tarjeta */}
      {me ? (
        <MyCard me={me} ctx={ctx} onClear={() => setMeId(null)} />
      ) : (
        <Card className="mt-4 p-4">
          <p className="text-[14px] font-medium">¿Cómo te llamás?</p>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscá tu nombre" className="pl-10" />
          </div>
          {suggestions.length > 0 && (
            <ul className="mt-2 divide-y divide-line-2 rounded-2xl border border-line-2">
              {suggestions.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => {
                      setMeId(p.id);
                      setQuery('');
                    }}
                    className="press flex w-full items-center justify-between px-3 py-2.5 text-left text-[14px] hover:bg-canvas"
                  >
                    {p.name}
                    <span className="text-[12px] text-muted">#{derived.rankOf[state.config.mode === 'fixed_pairs' ? (p.teamId ?? p.id) : p.id]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Segmented
        className="mt-5 w-full"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'ranking', label: 'Ranking' },
          { value: 'partidos', label: 'Partidos' },
          { value: 'resultados', label: 'Resultados' },
        ]}
      />

      <div className="mt-4">
        {tab === 'ranking' && <RankingTable showTitle={false} compact />}
        {tab === 'partidos' && (
          <div className="flex flex-col gap-4">
            <section>
              <h2 className="eyebrow mb-2">En juego</h2>
              <Card className="divide-y divide-line-2">
                {derived.onCourt.length === 0 && <p className="px-4 py-4 text-[14px] text-muted">No hay partidos en juego.</p>}
                {derived.onCourt.map((m) => (
                  <div key={m.id} className="px-4 py-3">
                    <div className="eyebrow mb-1">
                      {state.courts.find((c) => c.id === m.courtId)?.name}
                      {m.startedAt ? ` · ${formatMinutes(now - m.startedAt)}` : ''}
                    </div>
                    <SideNames side={m.sides[0]} state={state} onPlayerClick={openPlayer} />
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">vs</div>
                    <SideNames side={m.sides[1]} state={state} onPlayerClick={openPlayer} />
                  </div>
                ))}
              </Card>
            </section>
            <section>
              <h2 className="eyebrow mb-2">Próximos</h2>
              <Card className="divide-y divide-line-2">
                {derived.upcoming.length === 0 && <p className="px-4 py-4 text-[14px] text-muted">Se van a mostrar cuando haya jugadores esperando.</p>}
                {derived.upcoming.map((u, i) => (
                  <div key={u.matchId ?? i} className="flex items-center gap-3 px-4 py-3">
                    <span className="tabular text-[13px] font-semibold text-muted-2">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <SideNames side={u.sides[0]} state={state} size="sm" onPlayerClick={openPlayer} />
                      <span className="mx-1.5 text-[11px] uppercase tracking-wider text-muted-2">vs</span>
                      <SideNames side={u.sides[1]} state={state} size="sm" onPlayerClick={openPlayer} />
                    </div>
                    {u.kind === 'projected' && <span className="text-[11px] text-muted">estimado</span>}
                  </div>
                ))}
              </Card>
            </section>
          </div>
        )}
        {tab === 'resultados' && (
          <Card className="divide-y divide-line-2">
            {derived.finished.length === 0 && <p className="px-4 py-4 text-[14px] text-muted">Todavía no hay resultados.</p>}
            {derived.finished.map((m) => {
              const o = evaluateSets(m.sets, state.config.format);
              const w = o.valid ? o.winner : null;
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="eyebrow mb-0.5">
                      {state.courts.find((c) => c.id === m.courtId)?.name} · {m.finishedAt ? formatTime(m.finishedAt) : ''}
                    </div>
                    <div className={cn(w !== 0 && 'text-muted [&_button]:text-muted')}>
                      <SideNames side={m.sides[0]} state={state} size="sm" onPlayerClick={openPlayer} />
                    </div>
                    <div className={cn(w !== 1 && 'text-muted [&_button]:text-muted')}>
                      <SideNames side={m.sides[1]} state={state} size="sm" onPlayerClick={openPlayer} />
                    </div>
                  </div>
                  <span className="tabular text-[16px] font-bold">{formatScore(m.sets)}</span>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}

function MyCard({ me, ctx, onClear }: { me: { id: string; name: string; teamId: string | null }; ctx: EventContextValue; onClear: () => void }) {
  const { state, derived, now } = ctx;
  const competitorId = state.config.mode === 'fixed_pairs' ? (me.teamId ?? me.id) : me.id;
  const s = derived.stats.byId[competitorId];
  const player = state.players.find((p) => p.id === me.id)!;
  const status = playerStatus(state, derived, player, now);
  const current = s?.currentMatchId ? state.matches.find((m) => m.id === s.currentMatchId) : null;
  const upcomingIndex = derived.upcoming.findIndex((u) => u.sides.some((side) => side.playerIds.includes(me.id)));
  const upcoming = upcomingIndex >= 0 ? derived.upcoming[upcomingIndex] : null;
  const rest = s ? restMs(state, s, now) : 0;

  return (
    <Card className="mt-4 overflow-hidden">
      <div className="flex items-center gap-3 bg-ink px-4 py-3 text-white">
        <StatusDot status={status} className="bg-north" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold">{me.name}</div>
          <div className="text-[12px] text-white/60">
            {current ? `Jugando en ${state.courts.find((c) => c.id === current.courtId)?.name ?? 'cancha'}` : upcoming ? `Próximo partido · #${upcomingIndex + 1} en la lista` : status === 'available' || status === 'resting' ? `Esperando · ${formatMinutes(rest)}` : STATUS_LABELS[status]}
          </div>
        </div>
        <button onClick={onClear} className="press flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white" aria-label="Cambiar jugador">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-4 divide-x divide-line-2">
        <Mini label="Ranking" value={s && s.matchesPlayed > 0 && derived.rankOf[competitorId] ? `#${derived.rankOf[competitorId]}` : '—'} />
        <Mini label="Puntos" value={formatPoints(s?.points ?? 0)} />
        <Mini label="PJ" value={String(s?.matchesPlayed ?? 0)} />
        <Mini label="Games" value={signed(s?.gameDiff ?? 0)} />
      </div>
      {(current || upcoming) && (
        <div className="border-t border-line-2 px-4 py-3">
          <div className="eyebrow mb-1">{current ? 'Tu partido' : 'Tu próximo partido'}</div>
          {(() => {
            const sides = current ? current.sides : upcoming!.sides;
            const mine = sides.findIndex((side) => side.playerIds.includes(me.id)) as 0 | 1;
            return (
              <div className="text-[15px]">
                <SideNames side={sides[mine]} state={state} /> <span className="text-[11px] uppercase tracking-wider text-muted-2">vs</span>{' '}
                <SideNames side={sides[mine === 0 ? 1 : 0]} state={state} />
              </div>
            );
          })()}
        </div>
      )}
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5 text-center">
      <div className="eyebrow">{label}</div>
      <div className="tabular text-[18px] font-bold">{value}</div>
    </div>
  );
}
