import { evaluateSets, pointsForSide } from '../scoring/scoring-engine.js';
import { MINUTE } from '../shared/time.js';
import type {
  CompetitorStats,
  Match,
  MatchSide,
  MatchSummary,
  Player,
  PlayerDisplayStatus,
  TournamentConfig,
  TournamentState,
} from './types.js';

/**
 * Estadísticas derivadas. Nunca se persisten: se recalculan a partir de los
 * partidos finalizados y de los ajustes manuales de puntos. Así "editar un
 * resultado" o "deshacer" nunca deja números inconsistentes.
 */

/** Dos partidos se consideran "seguidos" si entre uno y otro hubo menos de este descanso. */
export const CONSECUTIVE_GAP_MS = 3 * MINUTE;

export interface StatsIndex {
  byId: Record<string, CompetitorStats>;
  list: CompetitorStats[];
  /** Cantidad de partidos finalizados. */
  finishedMatches: number;
}

/** Ids de competidores en un lado: jugadores (rotativo) o pareja (fijas). */
export function competitorIdsOfSide(state: TournamentState, side: MatchSide): string[] {
  if (state.config.mode === 'fixed_pairs') {
    return side.teamId ? [side.teamId] : [];
  }
  return side.playerIds;
}

export function competitorIds(state: TournamentState): string[] {
  return state.config.mode === 'fixed_pairs'
    ? state.teams.map((t) => t.id)
    : state.players.map((p) => p.id);
}

export function competitorName(state: TournamentState, id: string): string {
  if (state.config.mode === 'fixed_pairs') {
    const team = state.teams.find((t) => t.id === id);
    if (!team) return '?';
    if (team.name) return team.name;
    return team.playerIds.map((pid) => playerName(state, pid)).join(' + ');
  }
  return playerName(state, id);
}

export function playerName(state: TournamentState, id: string): string {
  return state.players.find((p) => p.id === id)?.name ?? '?';
}

export function playerById(state: TournamentState, id: string): Player | undefined {
  return state.players.find((p) => p.id === id);
}

/** ¿El competidor está activo (jugador activo / pareja con ambos activos)? */
export function isCompetitorActive(state: TournamentState, id: string): boolean {
  if (state.config.mode === 'fixed_pairs') {
    const team = state.teams.find((t) => t.id === id);
    if (!team) return false;
    return team.playerIds.every(
      (pid) => state.players.find((p) => p.id === pid)?.availability === 'active',
    );
  }
  return state.players.find((p) => p.id === id)?.availability === 'active';
}

function emptyStats(id: string, name: string): CompetitorStats {
  return {
    id,
    name,
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
  };
}

function bump(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

/** Orden cronológico de partidos finalizados. */
export function finishedMatchesInOrder(state: TournamentState): Match[] {
  return state.matches
    .filter((m) => m.status === 'finished' && m.sets)
    .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0) || a.createdAt - b.createdAt);
}

export function computeStats(state: TournamentState): StatsIndex {
  const byId: Record<string, CompetitorStats> = {};
  for (const id of competitorIds(state)) {
    byId[id] = emptyStats(id, competitorName(state, id));
  }

  const finished = finishedMatchesInOrder(state);
  const { format, scoring } = state.config;

  for (const match of finished) {
    const outcome = evaluateSets(match.sets, format);
    if (!outcome.valid) continue;
    const sideIds: [string[], string[]] = [
      competitorIdsOfSide(state, match.sides[0]),
      competitorIdsOfSide(state, match.sides[1]),
    ];
    for (const side of [0, 1] as const) {
      const other: 0 | 1 = side === 0 ? 1 : 0;
      const pts = pointsForSide(outcome, side, scoring, format);
      const outcomeFor: MatchSummary['outcome'] =
        outcome.winner === null ? 'draw' : outcome.winner === side ? 'win' : 'loss';
      for (const id of sideIds[side]) {
        const s = byId[id];
        if (!s) continue;
        s.matchesPlayed++;
        if (outcomeFor === 'win') s.wins++;
        else if (outcomeFor === 'draw') s.draws++;
        else s.losses++;
        s.points += pts;
        s.setsWon += outcome.setsWon[side];
        s.setsLost += outcome.setsWon[other];
        s.gamesWon += outcome.gamesWon[side];
        s.gamesLost += outcome.gamesWon[other];
        for (const partnerId of sideIds[side]) if (partnerId !== id) bump(s.partners, partnerId);
        for (const oppId of sideIds[other]) bump(s.opponents, oppId);
        s.lastMatchStartedAt = match.startedAt ?? match.finishedAt;
        s.lastMatchEndedAt = match.finishedAt;
        s.history.push({
          matchId: match.id,
          at: match.finishedAt ?? match.createdAt,
          courtId: match.courtId,
          partnerIds: sideIds[side].filter((x) => x !== id),
          opponentIds: sideIds[other],
          sets: match.sets!,
          outcome: outcomeFor,
          pointsEarned: pts,
          scoreFor: match.sets!.map(([a, b]) => (side === 0 ? [a, b] : [b, a]) as [number, number]),
        });
      }
    }
  }

  for (const adj of state.adjustments) {
    const s = byId[adj.targetId];
    if (s) s.adjustmentPoints += adj.delta;
  }

  // Partidos en curso / en cola
  for (const match of state.matches) {
    if (match.status === 'finished' || match.status === 'cancelled') continue;
    for (const side of match.sides) {
      for (const id of competitorIdsOfSide(state, side)) {
        const s = byId[id];
        if (!s) continue;
        if (match.status === 'queued') s.queuedMatchId = match.id;
        else s.currentMatchId = match.id;
      }
    }
  }

  // Derivados finales
  const list: CompetitorStats[] = [];
  for (const s of Object.values(byId)) {
    s.points = Math.round((s.points + s.adjustmentPoints) * 100) / 100;
    s.setDiff = s.setsWon - s.setsLost;
    s.gameDiff = s.gamesWon - s.gamesLost;
    s.consecutive = computeConsecutive(state, s);
    list.push(s);
  }

  return { byId, list, finishedMatches: finished.length };
}

/**
 * Racha de partidos seguidos: cuenta hacia atrás mientras el descanso entre
 * un partido y el siguiente fue menor a CONSECUTIVE_GAP_MS. Incluye el partido
 * en curso si lo hay.
 */
function computeConsecutive(state: TournamentState, s: CompetitorStats): number {
  const timeline: { start: number; end: number }[] = s.history.map((h) => {
    const m = state.matches.find((x) => x.id === h.matchId);
    return { start: m?.startedAt ?? h.at, end: h.at };
  });
  if (s.currentMatchId) {
    const m = state.matches.find((x) => x.id === s.currentMatchId);
    if (m && m.status === 'in_progress') {
      timeline.push({ start: m.startedAt ?? m.createdAt, end: Number.POSITIVE_INFINITY });
    }
  }
  if (timeline.length === 0) return 0;
  let streak = 1;
  for (let i = timeline.length - 1; i > 0; i--) {
    if (timeline[i].start - timeline[i - 1].end <= CONSECUTIVE_GAP_MS) streak++;
    else break;
  }
  return streak;
}

/** Milisegundos de descanso desde el último partido (o desde que entró al torneo). */
export function restMs(state: TournamentState, s: CompetitorStats, now: number): number {
  if (s.lastMatchEndedAt != null) return Math.max(0, now - s.lastMatchEndedAt);
  const joined = joinedAtOf(state, s.id);
  const base = Math.max(joined, state.startedAt ?? joined);
  return Math.max(0, now - base);
}

function joinedAtOf(state: TournamentState, competitorId: string): number {
  if (state.config.mode === 'fixed_pairs') {
    const team = state.teams.find((t) => t.id === competitorId);
    if (!team) return state.createdAt;
    return Math.max(
      ...team.playerIds.map((pid) => state.players.find((p) => p.id === pid)?.joinedAt ?? state.createdAt),
    );
  }
  return state.players.find((p) => p.id === competitorId)?.joinedAt ?? state.createdAt;
}

/** Partidos que "cuentan" para la equidad: jugados + compensación por llegada tarde/pausa. */
export function fairnessCount(state: TournamentState, s: CompetitorStats): number {
  if (state.config.mode === 'fixed_pairs') {
    const team = state.teams.find((t) => t.id === s.id);
    const offset = team
      ? Math.max(...team.playerIds.map((pid) => state.players.find((p) => p.id === pid)?.fairnessOffset ?? 0))
      : 0;
    return s.matchesPlayed + offset;
  }
  const offset = state.players.find((p) => p.id === s.id)?.fairnessOffset ?? 0;
  return s.matchesPlayed + offset;
}

export function displayStatus(
  player: Player,
  stats: CompetitorStats | undefined,
  config: TournamentConfig,
  now: number,
  matches: Match[],
): PlayerDisplayStatus {
  if (player.availability === 'absent') return 'absent';
  if (player.availability === 'paused') return 'paused';
  if (!stats) return 'available';
  if (stats.currentMatchId) {
    const m = matches.find((x) => x.id === stats.currentMatchId);
    return m?.status === 'in_progress' ? 'playing' : 'next';
  }
  if (stats.queuedMatchId) return 'next';
  if (
    stats.lastMatchEndedAt != null &&
    config.restMinutes > 0 &&
    now - stats.lastMatchEndedAt < config.restMinutes * MINUTE
  ) {
    return 'resting';
  }
  return 'available';
}

export const STATUS_LABELS: Record<PlayerDisplayStatus, string> = {
  playing: 'Jugando',
  available: 'Disponible',
  next: 'Próximo',
  resting: 'Descansando',
  paused: 'Pausado',
  absent: 'Ausente',
};
