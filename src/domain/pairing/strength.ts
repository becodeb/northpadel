import type { CompetitorStats, RankingEntry, StrengthSource, TournamentState } from '../tournament/types.js';

/**
 * Fuerza estimada de un competidor en escala 1 (más débil) a 5 (más fuerte).
 *
 * Combina el nivel declarado (si existe) con el rendimiento real en el torneo
 * (posición en el ranking en vivo, expresada como percentil). Con pocos partidos
 * pesa más el nivel declarado; a partir de 3 partidos manda el ranking.
 */

export const STRENGTH_MIN = 1;
export const STRENGTH_MAX = 5;
export const STRENGTH_RANGE = STRENGTH_MAX - STRENGTH_MIN;
const NEUTRAL = 3;
const MATCHES_TO_TRUST_RANKING = 3;

function declaredLevel(state: TournamentState, competitorId: string): number | null {
  if (state.config.mode === 'fixed_pairs') {
    const team = state.teams.find((t) => t.id === competitorId);
    if (!team) return null;
    const levels = team.playerIds
      .map((pid) => state.players.find((p) => p.id === pid)?.level ?? null)
      .filter((l): l is number => l != null);
    if (!levels.length) return null;
    return levels.reduce((a, b) => a + b, 0) / levels.length;
  }
  return state.players.find((p) => p.id === competitorId)?.level ?? null;
}

export function computeStrengths(
  state: TournamentState,
  stats: Record<string, CompetitorStats>,
  ranking: RankingEntry[],
  source: StrengthSource = state.config.pairing.strengthSource,
): Record<string, number> {
  const out: Record<string, number> = {};
  const n = ranking.length;
  const rankOf: Record<string, number> = {};
  for (const r of ranking) rankOf[r.competitorId] = r.rank;

  for (const r of ranking) {
    const id = r.competitorId;
    const level = declaredLevel(state, id);
    const base = level ?? NEUTRAL;
    const played = stats[id]?.matchesPlayed ?? 0;
    const percentile = n > 1 ? 1 - (rankOf[id] - 1) / (n - 1) : 0.5; // 1 = primero
    const perf = STRENGTH_MIN + STRENGTH_RANGE * percentile;

    let k: number;
    if (source === 'level') k = 0;
    else if (source === 'ranking') k = played > 0 ? 1 : 0;
    else k = Math.min(1, played / MATCHES_TO_TRUST_RANKING);

    // Sin nivel declarado y sin partidos: todos neutros (la primera ronda es "pareja")
    out[id] = played === 0 && level == null ? NEUTRAL : base * (1 - k) + perf * k;
  }
  return out;
}
