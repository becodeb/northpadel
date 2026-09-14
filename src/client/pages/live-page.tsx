import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { evaluateSets, formatScore, type Match, type MatchSide, type RankingEntry, type TournamentState } from '@domain';
import { Wordmark } from '@/components/brand/logo';
import { formatDuration, formatMinutes, formatPoints, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { EventContextValue } from './event/event-context';
import { PublicEventProvider } from './public-provider';

/**
 * Pantalla del torneo para la TV del club. Solo lectura, tipografía grande,
 * fondo oscuro. Se actualiza sola por WebSocket.
 */
export function EventLivePage() {
  const { id = '' } = useParams();
  return (
    <div className="min-h-dvh bg-ink-2 text-white">
      <PublicEventProvider
        id={id}
        withPlayerSheet={false}
        fallback={(status, error) => (
          <div className="flex min-h-dvh items-center justify-center text-white/60">{status === 'error' ? (error ?? 'No se encontró el torneo') : 'Cargando…'}</div>
        )}
      >
        {(ctx) => <LiveBoard ctx={ctx} />}
      </PublicEventProvider>
    </div>
  );
}

function Clock() {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setT(Date.now()), 10_000);
    return () => clearInterval(i);
  }, []);
  return <span className="tabular text-[20px] font-medium text-white/70">{formatTime(t)}</span>;
}

function LiveBoard({ ctx }: { ctx: EventContextValue }) {
  const { state, derived, now } = ctx;
  const courts = state.courts.slice().sort((a, b) => a.order - b.order);
  const matchByCourt = new Map(derived.onCourt.map((m) => [m.courtId, m]));
  const elapsed = state.startedAt ? (state.finishedAt ?? now) - state.startedAt : 0;
  const finished = state.status === 'finished';

  return (
    <div className="flex min-h-dvh flex-col px-6 py-5 lg:px-10 lg:py-7">
      <header className="flex items-center gap-6">
        <Wordmark light />
        <div className="h-8 w-px bg-white/15" />
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-bold tracking-tight lg:text-[32px]">{state.config.name}</h1>
        </div>
        <div className="ml-auto flex items-center gap-5">
          {state.status === 'live' && (
            <span className="flex items-center gap-2 rounded-full bg-north/15 px-3 py-1 text-[13px] font-semibold uppercase tracking-wider text-north">
              <span className="h-2 w-2 animate-pulse-soft rounded-full bg-north" />
              En vivo
            </span>
          )}
          {finished && <span className="rounded-full bg-white/10 px-3 py-1 text-[13px] font-semibold uppercase tracking-wider text-white/70">Finalizado</span>}
          {state.startedAt && <span className="tabular hidden text-[15px] text-white/50 lg:inline">{formatDuration(elapsed)} · {derived.finishedCount} partidos</span>}
          <Clock />
        </div>
      </header>

      <div className="mt-6 grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-6">
          {finished ? (
            <Podium ranking={derived.ranking} />
          ) : (
            <section className={cn('grid gap-4', courts.length <= 2 ? 'md:grid-cols-2' : 'md:grid-cols-2')}>
              {courts.map((c) => (
                <LiveCourt key={c.id} name={c.name} status={c.status} match={matchByCourt.get(c.id) ?? null} state={state} now={now} />
              ))}
            </section>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {!finished && (
              <section>
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.18em] text-white/50">Próximos</h2>
                <ul className="flex flex-col gap-2">
                  {derived.upcoming.slice(0, 4).map((u, i) => (
                    <li key={u.matchId ?? i} className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
                      <span className="tabular text-[15px] font-semibold text-white/40">{i + 1}</span>
                      <div className="min-w-0 flex-1 text-[17px]">
                        <Names side={u.sides[0]} state={state} /> <span className="text-[12px] uppercase tracking-wider text-white/40">vs</span> <Names side={u.sides[1]} state={state} />
                      </div>
                    </li>
                  ))}
                  {derived.upcoming.length === 0 && <li className="rounded-2xl bg-white/5 px-4 py-3 text-[15px] text-white/50">Esperando jugadores…</li>}
                </ul>
              </section>
            )}
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.18em] text-white/50">Últimos resultados</h2>
              <ul className="flex flex-col gap-2">
                {derived.finished.slice(0, finished ? 8 : 4).map((m) => {
                  const o = evaluateSets(m.sets, state.config.format);
                  const w = o.valid ? o.winner : null;
                  return (
                    <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-2.5 text-[16px]">
                      <div className="min-w-0 flex-1">
                        <div className={cn('truncate', w === 0 ? 'text-white' : 'text-white/50')}>
                          <Names side={m.sides[0]} state={state} />
                        </div>
                        <div className={cn('truncate', w === 1 ? 'text-white' : 'text-white/50')}>
                          <Names side={m.sides[1]} state={state} />
                        </div>
                      </div>
                      <span className="tabular shrink-0 text-[20px] font-bold">{formatScore(m.sets)}</span>
                    </li>
                  );
                })}
                {derived.finished.length === 0 && <li className="rounded-2xl bg-white/5 px-4 py-3 text-[15px] text-white/50">Todavía no hay resultados.</li>}
              </ul>
            </section>
          </div>
        </div>

        <aside className="min-w-0">
          <LiveRanking ranking={derived.ranking} finishedCount={derived.finishedCount} />
        </aside>
      </div>
    </div>
  );
}

function Names({ side, state }: { side: MatchSide; state: TournamentState }) {
  const team = state.config.mode === 'fixed_pairs' ? state.teams.find((t) => t.id === side.teamId) : null;
  if (team?.name) return <span className="font-semibold">{team.name}</span>;
  return (
    <span className="font-semibold">
      {side.playerIds.map((id) => state.players.find((p) => p.id === id)?.name ?? '?').join(' + ')}
    </span>
  );
}

function LiveCourt({ name, status, match, state, now }: { name: string; status: string; match: Match | null; state: TournamentState; now: number }) {
  return (
    <div className={cn('flex min-h-44 flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-5', !match && 'justify-center')}>
      <div className="flex items-center gap-3">
        <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/60">{name}</span>
        {match?.startedAt && (
          <span className="tabular flex items-center gap-1.5 text-[13px] text-white/50">
            <span className="h-1.5 w-1.5 rounded-full bg-north" />
            {formatMinutes(now - match.startedAt)}
          </span>
        )}
        {match?.status === 'scheduled' && <span className="text-[12px] font-semibold uppercase tracking-wider text-north">Listo</span>}
      </div>
      {match ? (
        <div className="mt-4 flex flex-col gap-1.5 text-[24px] leading-tight lg:text-[28px]">
          <Names side={match.sides[0]} state={state} />
          <span className="text-[12px] font-semibold uppercase tracking-[0.2em] text-white/35">vs</span>
          <Names side={match.sides[1]} state={state} />
        </div>
      ) : (
        <p className="mt-2 text-[18px] text-white/40">{status === 'available' ? 'Cancha libre' : status === 'occupied' ? 'Ocupada' : 'Fuera de servicio'}</p>
      )}
    </div>
  );
}

function LiveRanking({ ranking, finishedCount }: { ranking: RankingEntry[]; finishedCount: number }) {
  const PAGE = 14;
  const pages = Math.max(1, Math.ceil(ranking.length / PAGE));
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (pages <= 1) return;
    const i = setInterval(() => setPage((p) => (p + 1) % pages), 9000);
    return () => clearInterval(i);
  }, [pages]);
  const rows = ranking.slice(page * PAGE, page * PAGE + PAGE);
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/60">Ranking</h2>
        <span className="tabular text-[13px] text-white/40">
          {finishedCount} partidos{pages > 1 ? ` · ${page + 1}/${pages}` : ''}
        </span>
      </div>
      <table className="w-full text-[17px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-white/40">
            <th className="w-9 py-1 text-left font-semibold">#</th>
            <th className="py-1 text-left font-semibold">Jugador</th>
            <th className="tabular py-1 text-right font-semibold">PJ</th>
            <th className="tabular py-1 text-right font-semibold">PTS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.competitorId} className="border-t border-white/[0.06]">
              <td className={cn('tabular py-2 font-bold', r.rank === 1 ? 'text-north' : r.rank <= 3 ? 'text-white' : 'text-white/50')}>{r.rank}</td>
              <td className="max-w-0 truncate py-2 font-medium">{r.name}</td>
              <td className="tabular py-2 text-right text-white/60">{r.stats.matchesPlayed}</td>
              <td className="tabular py-2 text-right font-bold">{formatPoints(r.stats.points)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Podium({ ranking }: { ranking: RankingEntry[] }) {
  const [a, b, c] = ranking;
  return (
    <section className="grid gap-4 md:grid-cols-3">
      {[b, a, c].map((r, i) =>
        r ? (
          <div key={r.competitorId} className={cn('rounded-3xl border border-white/10 p-6', i === 1 ? 'bg-white/10 md:-translate-y-3' : 'bg-white/[0.04]')}>
            <div className="text-[36px]">{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : '🥉'}</div>
            <div className="mt-3 text-[26px] font-bold">{r.name}</div>
            <div className="tabular mt-1 text-[16px] text-white/60">
              {formatPoints(r.stats.points)} pts · {r.stats.wins}V {r.stats.losses}D
            </div>
          </div>
        ) : null,
      )}
    </section>
  );
}
