import { MINUTE } from '../shared/time.js';
import { competitorIdsOfSide, fairnessCount, isCompetitorActive, restMs, type StatsIndex } from '../tournament/stats.js';
import type { TournamentState } from '../tournament/types.js';

/**
 * FairnessEngine: mide qué tan justo viene el torneo y detecta situaciones a
 * corregir. Se usa en el dashboard (avisos) y en los tests de simulación
 * (métricas objetivas).
 */

export interface FairnessMetrics {
  players: number;
  finishedMatches: number;
  minMatches: number;
  maxMatches: number;
  /** Diferencia máxima de partidos asignados (jugados + en curso) entre competidores activos. */
  matchSpread: number;
  avgMatches: number;
  /** Cantidad de parejas que se repitieron (pares que jugaron juntos ≥ 2 veces, contando repeticiones). */
  repeatedPartnerships: number;
  /** Pares de rivales que se enfrentaron ≥ 2 veces (contando repeticiones). */
  repeatedOpponents: number;
  /** Partidos exactamente repetidos (misma alineación). */
  repeatedMatches: number;
  /** Compañeros distintos promedio por jugador (rotativo). */
  avgDistinctPartners: number;
  avgDistinctOpponents: number;
  /** Descanso promedio entre partidos (minutos). */
  avgRestMinutes: number;
  maxRestMinutes: number;
  /** Rachas de partidos seguidos por encima de lo permitido. */
  consecutiveViolations: number;
  /** Diferencia promedio de fuerza entre lados (0..1). */
  avgTeamStrengthGap: number | null;
}

export type FairnessWarningKind =
  | 'fewer_matches'
  | 'more_matches'
  | 'long_wait'
  | 'consecutive'
  | 'repeated_partner'
  | 'repeated_opponent';

export interface FairnessWarning {
  kind: FairnessWarningKind;
  competitorId: string;
  message: string;
  severity: 'info' | 'warning';
}

export function computeFairnessMetrics(
  state: TournamentState,
  stats: StatsIndex,
  now: number,
  strengths?: Record<string, number>,
): FairnessMetrics {
  const active = stats.list.filter((s) => isCompetitorActive(state, s.id));
  // Partidos asignados = finalizados + el que está jugando ahora (ya "cuenta" para la equidad).
  const inProgress = new Set(state.matches.filter((m) => m.status === 'in_progress').map((m) => m.id));
  const counts = active.map((s) => s.matchesPlayed + (s.currentMatchId && inProgress.has(s.currentMatchId) ? 1 : 0));
  const min = counts.length ? Math.min(...counts) : 0;
  const max = counts.length ? Math.max(...counts) : 0;

  let repeatedPartnerships = 0;
  let repeatedOpponents = 0;
  let distinctPartners = 0;
  let distinctOpponents = 0;
  const seenPairs = new Set<string>();
  for (const s of stats.list) {
    for (const [pid, n] of Object.entries(s.partners)) {
      const key = s.id < pid ? `${s.id}|${pid}` : `${pid}|${s.id}`;
      if (seenPairs.has(`p:${key}`)) continue;
      seenPairs.add(`p:${key}`);
      if (n > 1) repeatedPartnerships += n - 1;
    }
    for (const [oid, n] of Object.entries(s.opponents)) {
      const key = s.id < oid ? `${s.id}|${oid}` : `${oid}|${s.id}`;
      if (seenPairs.has(`o:${key}`)) continue;
      seenPairs.add(`o:${key}`);
      if (n > 1) repeatedOpponents += n - 1;
    }
    distinctPartners += Object.keys(s.partners).length;
    distinctOpponents += Object.keys(s.opponents).length;
  }

  const signatures = new Map<string, number>();
  let repeatedMatches = 0;
  for (const m of state.matches) {
    if (m.status !== 'finished') continue;
    const sig = m.sides
      .map((side) => competitorIdsOfSide(state, side).slice().sort().join('+'))
      .sort()
      .join(' vs ');
    const n = (signatures.get(sig) ?? 0) + 1;
    signatures.set(sig, n);
    if (n > 1) repeatedMatches++;
  }

  // Descansos: gaps entre partidos consecutivos de cada competidor.
  const gaps: number[] = [];
  let consecutiveViolations = 0;
  const maxConsecutive = state.config.pairing.maxConsecutive;
  for (const s of stats.list) {
    let streak = 0;
    for (let i = 1; i < s.history.length; i++) {
      const prevEnd = s.history[i - 1].at;
      const cur = state.matches.find((m) => m.id === s.history[i].matchId);
      const start = cur?.startedAt ?? s.history[i].at;
      const gap = Math.max(0, start - prevEnd);
      gaps.push(gap);
      if (gap <= 3 * MINUTE) {
        streak++;
        if (streak >= maxConsecutive) consecutiveViolations++;
      } else streak = 0;
    }
  }

  let avgTeamStrengthGap: number | null = null;
  if (strengths) {
    const gapsS: number[] = [];
    for (const m of state.matches) {
      if (m.status !== 'finished') continue;
      const avg = (ids: string[]) => ids.reduce((a, id) => a + (strengths[id] ?? 3), 0) / Math.max(1, ids.length);
      const a = avg(competitorIdsOfSide(state, m.sides[0]));
      const b = avg(competitorIdsOfSide(state, m.sides[1]));
      gapsS.push(Math.abs(a - b) / 4);
    }
    avgTeamStrengthGap = gapsS.length ? gapsS.reduce((x, y) => x + y, 0) / gapsS.length : null;
  }

  const n = Math.max(1, stats.list.length);
  return {
    players: state.players.length,
    finishedMatches: stats.finishedMatches,
    minMatches: min,
    maxMatches: max,
    matchSpread: max - min,
    avgMatches: counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0,
    repeatedPartnerships,
    repeatedOpponents,
    repeatedMatches,
    avgDistinctPartners: distinctPartners / n,
    avgDistinctOpponents: distinctOpponents / n,
    avgRestMinutes: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length / MINUTE : 0,
    maxRestMinutes: gaps.length ? Math.max(...gaps) / MINUTE : 0,
    consecutiveViolations,
    avgTeamStrengthGap,
  };
}

/** Avisos para el organizador sobre el estado actual (no sobre el pasado). */
export function computeFairnessWarnings(state: TournamentState, stats: StatsIndex, now: number): FairnessWarning[] {
  if (state.status !== 'live') return [];
  const warnings: FairnessWarning[] = [];
  const active = stats.list.filter((s) => isCompetitorActive(state, s.id));
  if (active.length < 4) return warnings;

  const counts = active.map((s) => fairnessCount(state, s));
  const min = Math.min(...counts);
  const max = Math.max(...counts);

  for (const s of active) {
    const fc = fairnessCount(state, s);
    if (max - min >= 2 && fc === min && !s.currentMatchId && !s.queuedMatchId) {
      warnings.push({
        kind: 'fewer_matches',
        competitorId: s.id,
        message: `${s.name} tiene ${max - fc} partidos menos que el que más jugó.`,
        severity: 'warning',
      });
    }
    if (!s.currentMatchId && !s.queuedMatchId) {
      const rest = restMs(state, s, now);
      if (rest >= 25 * MINUTE && s.matchesPlayed > 0) {
        warnings.push({
          kind: 'long_wait',
          competitorId: s.id,
          message: `${s.name} lleva ${Math.round(rest / MINUTE)} min esperando.`,
          severity: rest >= 40 * MINUTE ? 'warning' : 'info',
        });
      }
    }
    if (s.currentMatchId && s.consecutive > state.config.pairing.maxConsecutive) {
      warnings.push({
        kind: 'consecutive',
        competitorId: s.id,
        message: `${s.name} va por su ${s.consecutive}º partido seguido.`,
        severity: 'info',
      });
    }
  }
  return warnings.slice(0, 6);
}
