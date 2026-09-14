import { Download, Share2 } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { computeRanking, computeStats, formatScore, type RankingEntry, type TournamentState } from '@domain';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { formatDuration, formatPoints, signed } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NorthMark } from '@/components/brand/logo';

interface FinalStats {
  podium: RankingEntry[];
  matches: number;
  duration: number;
  mostWins: RankingEntry | null;
  bestComeback: { name: string; from: number; to: number } | null;
  biggestWin: { label: string; score: string } | null;
  totalGames: number;
}

/** Estadísticas de cierre, incluyendo "mayor remontada" (peor posición → final). */
export function computeFinalStats(state: TournamentState, ranking: RankingEntry[]): FinalStats {
  const finished = state.matches.filter((m) => m.status === 'finished' && m.finishedAt).sort((a, b) => a.finishedAt! - b.finishedAt!);
  const mostWins = ranking.slice().sort((a, b) => b.stats.wins - a.stats.wins || a.rank - b.rank)[0] ?? null;

  // Remontada: reproducimos el ranking tras cada partido y buscamos la mayor caída→recuperación.
  const worst: Record<string, number> = {};
  const half = Math.floor(finished.length / 2);
  for (let i = Math.max(1, Math.floor(finished.length / 4)); i <= finished.length; i++) {
    if (i < 2) continue;
    const partial: TournamentState = { ...state, matches: finished.slice(0, i) };
    const stats = computeStats(partial);
    const r = computeRanking(stats.list, { tiebreakers: state.config.tiebreakers, seed: state.seed });
    for (const e of r) {
      if (e.stats.matchesPlayed >= 2 && i <= Math.max(half, 2)) worst[e.competitorId] = Math.max(worst[e.competitorId] ?? 0, e.rank);
    }
  }
  let bestComeback: FinalStats['bestComeback'] = null;
  for (const e of ranking) {
    const from = worst[e.competitorId];
    if (from && from - e.rank > (bestComeback ? bestComeback.from - bestComeback.to : 2)) {
      bestComeback = { name: e.name, from, to: e.rank };
    }
  }

  let biggestWin: FinalStats['biggestWin'] = null;
  let biggestDiff = 0;
  let totalGames = 0;
  for (const m of finished) {
    if (!m.sets) continue;
    const a = m.sets.reduce((acc, s) => acc + s[0], 0);
    const b = m.sets.reduce((acc, s) => acc + s[1], 0);
    totalGames += a + b;
    const diff = Math.abs(a - b);
    if (diff > biggestDiff) {
      biggestDiff = diff;
      const win = a > b ? 0 : 1;
      const names = (side: 0 | 1) => m.sides[side].playerIds.map((id) => state.players.find((p) => p.id === id)?.name.split(' ')[0] ?? '?').join(' + ');
      biggestWin = { label: `${names(win)} a ${names(win === 0 ? 1 : 0)}`, score: formatScore(m.sets, win) };
    }
  }

  return {
    podium: ranking.slice(0, 3),
    matches: finished.length,
    duration: state.finishedAt && state.startedAt ? state.finishedAt - state.startedAt : 0,
    mostWins,
    bestComeback,
    biggestWin,
    totalGames,
  };
}

export function FinalScreen({ state, ranking, onReopen }: { state: TournamentState; ranking: RankingEntry[]; onReopen?: () => void }) {
  const stats = useMemo(() => computeFinalStats(state, ranking), [state, ranking]);
  const [first, second, third] = stats.podium;

  const shareText = () => {
    const lines = [
      `${state.config.name} · North Padel`,
      ...ranking.slice(0, 10).map((r) => `${r.rank}. ${r.name} — ${formatPoints(r.stats.points)} pts (${r.stats.wins}V ${r.stats.losses}D)`),
      `${stats.matches} partidos · ${formatDuration(stats.duration)}`,
    ];
    return lines.join('\n');
  };

  const share = async () => {
    const text = shareText();
    if (navigator.share) {
      try {
        await navigator.share({ title: state.config.name, text });
        return;
      } catch {
        /* cancelado */
      }
    }
    await navigator.clipboard.writeText(text);
    toast.success('Resultados copiados');
  };

  const download = () => {
    const header = ['Pos', 'Nombre', 'PJ', 'PG', 'PE', 'PP', 'PTS', 'Sets +/-', 'Games +/-'];
    const rows = ranking.map((r) => [r.rank, r.name, r.stats.matchesPlayed, r.stats.wins, r.stats.draws, r.stats.losses, r.stats.points, r.stats.setDiff, r.stats.gameDiff]);
    const csv = [header, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.config.name.replace(/[^\w\s-]/g, '').trim() || 'torneo'}-ranking.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-rise-in flex flex-col gap-6">
      <Card className="relative overflow-hidden bg-ink-2 px-6 py-8 text-white md:px-10 md:py-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-north/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-magenta/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <NorthMark size={30} />
            <span className="eyebrow text-white/60">Torneo finalizado</span>
          </div>
          <h2 className="mt-4 text-[26px] font-bold tracking-tight md:text-[32px]">{state.config.name}</h2>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {[first, second, third].map((entry, i) =>
              entry ? (
                <div
                  key={entry.competitorId}
                  className={cn(
                    'rounded-2xl border border-white/10 bg-white/5 p-4',
                    i === 0 && 'md:order-2 md:-translate-y-2 md:border-north/50 md:bg-white/10',
                    i === 1 && 'md:order-1',
                    i === 2 && 'md:order-3',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn('text-[22px]', i === 0 && 'text-[28px]')}>{['🥇', '🥈', '🥉'][i]}</span>
                    <span className="tabular text-[13px] text-white/60">{formatPoints(entry.stats.points)} pts</span>
                  </div>
                  <p className={cn('mt-3 truncate font-semibold', i === 0 ? 'text-[20px]' : 'text-[17px]')}>{entry.name}</p>
                  <p className="mt-0.5 text-[13px] text-white/60">
                    {entry.stats.wins}V {entry.stats.draws > 0 ? `${entry.stats.draws}E ` : ''}
                    {entry.stats.losses}D · games {signed(entry.stats.gameDiff)}
                  </p>
                </div>
              ) : null,
            )}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="north" onClick={share}>
              <Share2 className="h-4 w-4" />
              Compartir
            </Button>
            <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10" onClick={download}>
              <Download className="h-4 w-4" />
              Descargar CSV
            </Button>
            {onReopen && (
              <Button variant="ghost" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={onReopen}>
                Reabrir torneo
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Partidos jugados" value={String(stats.matches)} />
        <StatCard label="Duración" value={formatDuration(stats.duration)} />
        <StatCard label="Más victorias" value={stats.mostWins ? `${stats.mostWins.stats.wins}` : '—'} sub={stats.mostWins?.name} />
        <StatCard
          label="Mayor remontada"
          value={stats.bestComeback ? `#${stats.bestComeback.from} → #${stats.bestComeback.to}` : '—'}
          sub={stats.bestComeback?.name}
        />
        <StatCard label="Games jugados" value={String(stats.totalGames)} />
        <StatCard label="Jugadores" value={String(state.players.filter((p) => p.availability !== 'absent').length)} />
        <StatCard label="Victoria más amplia" value={stats.biggestWin?.score ?? '—'} sub={stats.biggestWin?.label} className="col-span-2" />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, className }: { label: string; value: string; sub?: string | null; className?: string }) {
  return (
    <Card className={cn('px-4 py-3.5', className)}>
      <div className="eyebrow">{label}</div>
      <div className="tabular mt-1 text-[22px] font-bold text-ink">{value}</div>
      {sub && <div className="truncate text-[13px] text-muted">{sub}</div>}
    </Card>
  );
}
