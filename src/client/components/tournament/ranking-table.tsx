import { ChevronDown, ChevronUp } from 'lucide-react';
import { LayoutGroup, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { RankingEntry } from '@domain';
import { Card, SectionTitle } from '@/components/ui/primitives';
import { formatPoints, signed } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useEvent } from '@/pages/event/event-context';
import { RankPill } from './names';

/**
 * Ranking en vivo. Las filas se reordenan con animación de layout (motion) y
 * marcan por unos segundos quién subió o bajó.
 */
export function RankingTable({
  limit,
  title = 'Ranking en vivo',
  compact = false,
  showTitle = true,
}: {
  limit?: number;
  title?: string;
  compact?: boolean;
  showTitle?: boolean;
}) {
  const { state, derived, openPlayer } = useEvent();
  const [expanded, setExpanded] = useState(false);
  const isTeam = state.config.mode === 'fixed_pairs';
  const rows = limit && !expanded ? derived.ranking.slice(0, limit) : derived.ranking;
  const movements = useMovements(derived.ranking);
  const showFull = !compact;

  return (
    <section>
      {showTitle && (
        <SectionTitle right={<span className="text-[12px] text-muted">{derived.finishedCount} partidos</span>}>{title}</SectionTitle>
      )}
      <Card className="overflow-hidden">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="w-10 px-3 py-2.5 font-semibold">#</th>
              <th className="px-2 py-2.5 font-semibold">{isTeam ? 'Pareja' : 'Jugador'}</th>
              <th className="tabular px-2 py-2.5 text-right font-semibold">PJ</th>
              {showFull && (
                <>
                  <th className="tabular hidden px-2 py-2.5 text-right font-semibold md:table-cell">PG</th>
                  <th className="tabular hidden px-2 py-2.5 text-right font-semibold md:table-cell">PE</th>
                  <th className="tabular hidden px-2 py-2.5 text-right font-semibold md:table-cell">PP</th>
                </>
              )}
              <th className="tabular px-2 py-2.5 text-right font-semibold">PTS</th>
              {showFull && (
                <>
                  <th className="tabular hidden px-2 py-2.5 text-right font-semibold lg:table-cell">Sets</th>
                  <th className="tabular hidden px-3 py-2.5 text-right font-semibold md:table-cell">Games</th>
                </>
              )}
            </tr>
          </thead>
          <LayoutGroup id="ranking">
            <tbody>
              {rows.map((r) => (
                <RankingRow key={r.competitorId} entry={r} movement={movements[r.competitorId] ?? 0} showFull={showFull} onClick={() => !isTeam && openPlayer(r.competitorId)} />
              ))}
            </tbody>
          </LayoutGroup>
        </table>
        {limit && derived.ranking.length > limit && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="press flex w-full items-center justify-center gap-1 border-t border-line-2 py-2.5 text-[13px] font-medium text-muted hover:text-ink"
          >
            {expanded ? (
              <>
                Ver menos <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                Ver los {derived.ranking.length} <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>
        )}
      </Card>
    </section>
  );
}

function RankingRow({ entry, movement, showFull, onClick }: { entry: RankingEntry; movement: number; showFull: boolean; onClick: () => void }) {
  const s = entry.stats;
  return (
    <motion.tr
      layout="position"
      transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.8 }}
      onClick={onClick}
      className={cn('cursor-pointer border-t border-line-2 hover:bg-canvas', movement !== 0 && 'animate-flash')}
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <RankPill rank={entry.rank} />
          {movement !== 0 && (
            <span className={cn('text-[11px] font-semibold', movement > 0 ? 'text-north-ink' : 'text-magenta-ink')}>
              {movement > 0 ? '▲' : '▼'}
              {Math.abs(movement)}
            </span>
          )}
        </div>
      </td>
      <td className="max-w-0 truncate px-2 py-2 font-medium text-ink">{entry.name}</td>
      <td className="tabular px-2 py-2 text-right text-muted">{s.matchesPlayed}</td>
      {showFull && (
        <>
          <td className="tabular hidden px-2 py-2 text-right md:table-cell">{s.wins}</td>
          <td className="tabular hidden px-2 py-2 text-right text-muted md:table-cell">{s.draws}</td>
          <td className="tabular hidden px-2 py-2 text-right text-muted md:table-cell">{s.losses}</td>
        </>
      )}
      <td className="tabular px-2 py-2 text-right font-bold text-ink">{formatPoints(s.points)}</td>
      {showFull && (
        <>
          <td className="tabular hidden px-2 py-2 text-right text-muted lg:table-cell">{signed(s.setDiff)}</td>
          <td className="tabular hidden px-3 py-2 text-right text-muted md:table-cell">{signed(s.gameDiff)}</td>
        </>
      )}
    </motion.tr>
  );
}

/** Diferencia de posición respecto del ranking anterior, visible unos segundos. */
function useMovements(ranking: RankingEntry[]): Record<string, number> {
  const previous = useRef<Record<string, number>>({});
  const [movements, setMovements] = useState<Record<string, number>>({});
  useEffect(() => {
    const next: Record<string, number> = {};
    let changed = false;
    for (const r of ranking) {
      const prev = previous.current[r.competitorId];
      if (prev != null && prev !== r.rank && r.stats.matchesPlayed > 0) {
        next[r.competitorId] = prev - r.rank;
        changed = true;
      }
      previous.current[r.competitorId] = r.rank;
    }
    if (changed) {
      setMovements(next);
      const t = setTimeout(() => setMovements({}), 4000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [ranking]);
  return movements;
}
