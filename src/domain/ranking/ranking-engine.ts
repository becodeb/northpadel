import { stableLottery } from '../shared/rng.js';
import type { CompetitorStats, RankingEntry, TiebreakCriterion } from '../tournament/types.js';

/**
 * RankingEngine: ordena competidores aplicando los criterios de desempate en
 * el orden configurado. Cada criterio se aplica solo dentro del grupo que
 * sigue empatado por los criterios anteriores (como una tabla de fútbol).
 *
 * "Enfrentamiento directo" arma una mini-tabla entre los empatados: puntos
 * obtenidos en partidos donde se enfrentaron, luego victorias entre ellos.
 * Si nunca se enfrentaron, el criterio simplemente no separa y se pasa al siguiente.
 */

export interface RankingOptions {
  tiebreakers: TiebreakCriterion[];
  seed: string;
}

function metric(s: CompetitorStats, c: Exclude<TiebreakCriterion, 'headToHead' | 'random'>): number {
  switch (c) {
    case 'points':
      return s.points;
    case 'wins':
      return s.wins;
    case 'setDiff':
      return s.setDiff;
    case 'gameDiff':
      return s.gameDiff;
    case 'gamesWon':
      return s.gamesWon;
  }
}

function headToHeadScore(s: CompetitorStats, groupIds: Set<string>): [number, number] {
  let pts = 0;
  let wins = 0;
  for (const h of s.history) {
    if (h.opponentIds.some((o) => groupIds.has(o))) {
      pts += h.pointsEarned;
      if (h.outcome === 'win') wins++;
    }
  }
  return [pts, wins];
}

function splitByKey<T>(items: T[], key: (t: T) => string): T[][] {
  const groups: T[][] = [];
  let current: T[] = [];
  let currentKey: string | null = null;
  for (const item of items) {
    const k = key(item);
    if (currentKey === null || k === currentKey) {
      current.push(item);
    } else {
      groups.push(current);
      current = [item];
    }
    currentKey = k;
  }
  if (current.length) groups.push(current);
  return groups;
}

function rankGroup(
  group: CompetitorStats[],
  criteria: TiebreakCriterion[],
  index: number,
  seed: string,
): CompetitorStats[] {
  if (group.length <= 1 || index >= criteria.length) return group;
  const criterion = criteria[index];

  if (criterion === 'random') {
    return group.slice().sort((a, b) => stableLottery(seed, a.id) - stableLottery(seed, b.id));
  }

  let keyed: { s: CompetitorStats; key: number[] }[];
  if (criterion === 'headToHead') {
    const ids = new Set(group.map((g) => g.id));
    keyed = group.map((s) => ({ s, key: headToHeadScore(s, ids) }));
  } else {
    keyed = group.map((s) => ({ s, key: [metric(s, criterion)] }));
  }

  keyed.sort((a, b) => {
    for (let i = 0; i < a.key.length; i++) {
      if (a.key[i] !== b.key[i]) return b.key[i] - a.key[i];
    }
    return 0;
  });

  const subgroups = splitByKey(keyed, (k) => k.key.join('|'));
  const out: CompetitorStats[] = [];
  for (const sub of subgroups) {
    out.push(
      ...rankGroup(
        sub.map((k) => k.s),
        criteria,
        index + 1,
        seed,
      ),
    );
  }
  return out;
}

export function computeRanking(stats: CompetitorStats[], options: RankingOptions): RankingEntry[] {
  const criteria = options.tiebreakers.length ? options.tiebreakers : ['points'];
  // orden base estable por nombre para que el resultado sea determinista
  const base = stats.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const ordered = rankGroup(base, criteria as TiebreakCriterion[], 0, options.seed);
  return ordered.map((s, i) => ({ rank: i + 1, competitorId: s.id, name: s.name, stats: s }));
}

/** Posición (1-based) por id, útil para fuerza/percentiles. */
export function rankIndex(ranking: RankingEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of ranking) out[r.competitorId] = r.rank;
  return out;
}
