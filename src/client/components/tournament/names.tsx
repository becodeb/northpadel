import type { MatchSide, TournamentState } from '@domain';
import type { Derived } from '@/lib/derived';
import { cn } from '@/lib/utils';

/** Nombres de un lado del partido: "Juan Pérez + Pedro García" con posición opcional. */
export function SideNames({
  side,
  state,
  derived,
  className,
  withRank = false,
  emphasis = false,
  onPlayerClick,
  size = 'md',
}: {
  side: MatchSide;
  state: TournamentState;
  derived?: Derived;
  className?: string;
  withRank?: boolean;
  emphasis?: boolean;
  onPlayerClick?: (id: string) => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const sizes = { sm: 'text-[13px]', md: 'text-[15px]', lg: 'text-[17px]', xl: 'text-[22px]' };
  const isTeam = state.config.mode === 'fixed_pairs';
  const teamName = isTeam ? state.teams.find((t) => t.id === side.teamId)?.name : null;
  return (
    <span className={cn('inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5', sizes[size], className)}>
      {teamName ? (
        <span className={cn('truncate font-semibold', emphasis ? 'text-ink' : 'text-ink')}>{teamName}</span>
      ) : (
        side.playerIds.map((id, i) => {
          const player = state.players.find((p) => p.id === id);
          const played = derived?.stats.byId[id]?.matchesPlayed ?? 0;
          const rank = withRank && derived && !isTeam && played > 0 ? derived.rankOf[id] : undefined;
          return (
            <span key={id} className="inline-flex min-w-0 items-baseline gap-1">
              {i > 0 && <span className="text-muted-2">+</span>}
              <button
                type="button"
                disabled={!onPlayerClick}
                onClick={() => onPlayerClick?.(id)}
                className={cn(
                  'truncate text-left font-semibold text-ink',
                  onPlayerClick && 'press hover:text-north-ink',
                  !onPlayerClick && 'cursor-default',
                )}
              >
                {player?.name ?? '?'}
              </button>
              {rank != null && <span className="tabular text-[11px] font-medium text-muted">#{rank}</span>}
            </span>
          );
        })
      )}
    </span>
  );
}

export function RankPill({ rank, className }: { rank: number; className?: string }) {
  return (
    <span
      className={cn(
        'tabular inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-[12px] font-bold',
        rank === 1 ? 'bg-ink text-white' : rank <= 3 ? 'bg-canvas-2 text-ink' : 'text-muted',
        className,
      )}
    >
      {rank}
    </span>
  );
}
