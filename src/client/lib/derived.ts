import { useMemo } from 'react';
import {
  computeFairnessWarnings,
  computeRanking,
  computeStats,
  computeStrengths,
  displayStatus,
  freeCourts,
  projectUpcoming,
  queuedMatches,
  type CompetitorStats,
  type FairnessWarning,
  type Match,
  type Player,
  type PlayerDisplayStatus,
  type RankingEntry,
  type StatsIndex,
  type TournamentState,
  type UpcomingMatch,
} from '@domain';

export interface Derived {
  stats: StatsIndex;
  ranking: RankingEntry[];
  rankOf: Record<string, number>;
  strengths: Record<string, number>;
  upcoming: UpcomingMatch[];
  queued: Match[];
  onCourt: Match[];
  finished: Match[];
  freeCourtIds: Set<string>;
  finishedCount: number;
  playerById: Record<string, Player>;
  competitorStats: (id: string) => CompetitorStats | undefined;
}

/** Todo lo derivado del estado (memoizado): stats, ranking, próximos, canchas libres. */
export function useDerived(state: TournamentState | null): Derived | null {
  return useMemo(() => {
    if (!state) return null;
    const stats = computeStats(state);
    const ranking = computeRanking(stats.list, { tiebreakers: state.config.tiebreakers, seed: state.seed });
    const rankOf: Record<string, number> = {};
    for (const r of ranking) rankOf[r.competitorId] = r.rank;
    const strengths = computeStrengths(state, stats.byId, ranking);
    const upcoming = projectUpcoming(state);
    const onCourt = state.matches.filter((m) => m.status === 'in_progress' || m.status === 'scheduled');
    const finished = state.matches
      .filter((m) => m.status === 'finished')
      .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
    const playerById: Record<string, Player> = {};
    for (const p of state.players) playerById[p.id] = p;
    return {
      stats,
      ranking,
      rankOf,
      strengths,
      upcoming,
      queued: queuedMatches(state),
      onCourt,
      finished,
      freeCourtIds: new Set(freeCourts(state).map((c) => c.id)),
      finishedCount: finished.length,
      playerById,
      competitorStats: (id: string) => stats.byId[id],
    };
  }, [state]);
}

export function useWarnings(state: TournamentState | null, derived: Derived | null, now: number): FairnessWarning[] {
  return useMemo(() => {
    if (!state || !derived) return [];
    return computeFairnessWarnings(state, derived.stats, now);
  }, [state, derived, now]);
}

export function playerStatus(state: TournamentState, derived: Derived, player: Player, now: number): PlayerDisplayStatus {
  const competitorId = state.config.mode === 'fixed_pairs' ? (player.teamId ?? player.id) : player.id;
  return displayStatus(player, derived.stats.byId[competitorId], state.config, now, state.matches);
}
