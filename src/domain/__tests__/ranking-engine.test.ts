import { describe, expect, it } from 'vitest';
import { computeRanking } from '../ranking/ranking-engine.js';
import type { CompetitorStats, MatchSummary } from '../tournament/types.js';

function stats(id: string, patch: Partial<CompetitorStats> = {}): CompetitorStats {
  return {
    id,
    name: id,
    matchesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    adjustmentPoints: 0,
    setsWon: 0,
    setsLost: 0,
    gamesWon: 0,
    gamesLost: 0,
    setDiff: 0,
    gameDiff: 0,
    partners: {},
    opponents: {},
    lastMatchStartedAt: null,
    lastMatchEndedAt: null,
    consecutive: 0,
    currentMatchId: null,
    queuedMatchId: null,
    history: [],
    ...patch,
  };
}

function h2h(opponent: string, outcome: MatchSummary['outcome'], pointsEarned: number): MatchSummary {
  return {
    matchId: 'm',
    at: 0,
    courtId: null,
    partnerIds: [],
    opponentIds: [opponent],
    sets: [[6, 4]],
    outcome,
    pointsEarned,
    scoreFor: [[6, 4]],
  };
}

describe('RankingEngine', () => {
  it('ordena por puntos y aplica desempates en orden', () => {
    const list = [
      stats('A', { points: 9, wins: 3, gameDiff: 4 }),
      stats('B', { points: 9, wins: 3, gameDiff: 7 }),
      stats('C', { points: 12, wins: 4 }),
      stats('D', { points: 3, wins: 1 }),
    ];
    const r = computeRanking(list, { tiebreakers: ['points', 'wins', 'gameDiff'], seed: 's' });
    expect(r.map((x) => x.competitorId)).toEqual(['C', 'B', 'A', 'D']);
    expect(r[0].rank).toBe(1);
  });

  it('el orden de criterios configurado cambia el resultado', () => {
    const list = [stats('A', { points: 9, wins: 2, gameDiff: 10 }), stats('B', { points: 9, wins: 3, gameDiff: 2 })];
    expect(computeRanking(list, { tiebreakers: ['points', 'wins'], seed: 's' })[0].competitorId).toBe('B');
    expect(computeRanking(list, { tiebreakers: ['points', 'gameDiff'], seed: 's' })[0].competitorId).toBe('A');
  });

  it('enfrentamiento directo solo entre los empatados', () => {
    const list = [
      stats('A', { points: 6, history: [h2h('B', 'loss', 0), h2h('C', 'win', 3)] }),
      stats('B', { points: 6, history: [h2h('A', 'win', 3), h2h('C', 'loss', 0)] }),
      stats('C', { points: 9 }),
    ];
    const r = computeRanking(list, { tiebreakers: ['points', 'headToHead', 'random'], seed: 's' });
    expect(r.map((x) => x.competitorId)).toEqual(['C', 'B', 'A']);
  });

  it('si nunca se enfrentaron, pasa al siguiente criterio', () => {
    const list = [stats('A', { points: 6, gameDiff: 1 }), stats('B', { points: 6, gameDiff: 5 })];
    const r = computeRanking(list, { tiebreakers: ['points', 'headToHead', 'gameDiff'], seed: 's' });
    expect(r[0].competitorId).toBe('B');
  });

  it('sorteo determinista: mismo seed, mismo orden', () => {
    const list = [stats('A'), stats('B'), stats('C'), stats('D')];
    const a = computeRanking(list, { tiebreakers: ['points', 'random'], seed: 'x' }).map((r) => r.competitorId);
    const b = computeRanking(list, { tiebreakers: ['points', 'random'], seed: 'x' }).map((r) => r.competitorId);
    const c = computeRanking(list, { tiebreakers: ['points', 'random'], seed: 'y' }).map((r) => r.competitorId);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(4);
    expect(a.join()).not.toEqual(c.join());
  });

  it('dos jugadores con exactamente los mismos números no rompen nada', () => {
    const list = [stats('A', { points: 5, wins: 1, gameDiff: 2 }), stats('B', { points: 5, wins: 1, gameDiff: 2 })];
    const r = computeRanking(list, { tiebreakers: ['points', 'wins', 'gameDiff'], seed: 's' });
    expect(r.length).toBe(2);
    expect(r.map((x) => x.rank)).toEqual([1, 2]);
  });
});
