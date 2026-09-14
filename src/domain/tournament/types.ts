/**
 * Modelo de dominio del torneo.
 *
 * El torneo es el agregado raíz: su estado completo (jugadores, parejas, canchas,
 * partidos, ajustes) se deriva de un log de eventos inmutable. Las estadísticas,
 * el ranking y la disponibilidad NO se guardan: se calculan a partir de los partidos
 * (ver stats.ts / ranking-engine.ts). Eso hace imposible que queden desincronizados.
 */

// ─── Configuración ──────────────────────────────────────────────────────────

export type TournamentMode = 'rotating' | 'fixed_pairs';

export type PresetId = 'north_open' | 'americano' | 'mexicano' | 'fixed_pairs' | 'custom';

/**
 * sets   → N sets de X games (formato clásico).
 * games  → un único set contado por games (ej. 1 set a 6, o partido por tiempo).
 * points → un único marcador por puntos (ej. Americano a 32 puntos).
 */
export type ScoringFormatKind = 'sets' | 'games' | 'points';

export interface MatchFormat {
  kind: ScoringFormatKind;
  /** Sets al mejor de N (solo kind=sets). */
  bestOf: 1 | 3 | 5;
  /** Games por set (6 clásico, 4 sets cortos). En kind=games es el objetivo del set. */
  gamesPerSet: number;
  /** Permite 7-6 (tie-break). */
  tiebreak: boolean;
  /** Set decisivo como super tie-break a 10 puntos. */
  superTiebreak: boolean;
  /** Partido por tiempo: el marcador vale tal como quedó (puede terminar 4-4). */
  timed: boolean;
  timeMinutes: number | null;
  /** Permite empate (si no, el operador debe cargar un ganador). */
  allowDraw: boolean;
  /** kind=points: puntos totales del partido (ej. 32) — informativo para la carga. */
  targetPoints: number;
  /** true = validar marcadores según reglas; false = carga manual libre. */
  strict: boolean;
}

export interface ScoringRules {
  win: number;
  draw: number;
  loss: number;
  perSetWon: number;
  perSetLost: number;
  perGameWon: number;
  perGameLost: number;
  /** Puntos por cada game de diferencia (puede ser fraccionario, ej. 0.1). */
  perGameDiff: number;
  /** Bonus por ganar sin ceder sets (solo sets al mejor de 3+). */
  straightSetsBonus: number;
}

export type PairingStrategy =
  | 'random'
  | 'balanced'
  | 'by_level'
  | 'top_bottom'
  | 'max_rotation'
  | 'custom';

/** Pesos relativos (0-100) para la estrategia personalizada. */
export interface PairingWeights {
  matchBalance: number;
  partnerRepeat: number;
  opponentRepeat: number;
  rest: number;
  level: number;
}

export type StrengthSource = 'auto' | 'ranking' | 'level';

export interface PairingRules {
  strategy: PairingStrategy;
  weights: PairingWeights;
  /** Partidos seguidos permitidos antes de penalizar fuerte. */
  maxConsecutive: number;
  strengthSource: StrengthSource;
  /** Cantidad de partidos a mostrar en "Próximos". null = automático (una por cancha). */
  previewCount: number | null;
  /** Al asignar cancha, el partido arranca solo (sin tocar "Iniciar"). */
  autoStart: boolean;
}

export type TiebreakCriterion =
  | 'points'
  | 'wins'
  | 'setDiff'
  | 'gameDiff'
  | 'gamesWon'
  | 'headToHead'
  | 'random';

export interface TournamentConfig {
  name: string;
  mode: TournamentMode;
  preset: PresetId;
  format: MatchFormat;
  scoring: ScoringRules;
  pairing: PairingRules;
  tiebreakers: TiebreakCriterion[];
  /** Minutos desde el último partido durante los cuales un jugador se muestra "descansando". */
  restMinutes: number;
  /** Fecha/hora programada del evento (epoch ms) — informativa. */
  scheduledAt: number | null;
  description: string;
}

// ─── Entidades ──────────────────────────────────────────────────────────────

export type Availability = 'active' | 'paused' | 'absent';

export interface Player {
  id: string;
  name: string;
  /** Nivel 1 (inicial) a 5 (avanzado). null = desconocido. */
  level: number | null;
  availability: Availability;
  joinedAt: number;
  /**
   * Compensación de partidos para el motor de equidad. Un jugador que llega tarde
   * o vuelve de una pausa arranca al nivel mínimo del resto en vez de "deber" partidos.
   * Solo afecta a la selección, nunca al ranking.
   */
  fairnessOffset: number;
  /** Pareja fija (solo modo fixed_pairs). */
  teamId: string | null;
}

export interface Team {
  id: string;
  name: string | null;
  playerIds: [string, string];
}

export type CourtStatus = 'available' | 'occupied' | 'out_of_service';

export interface Court {
  id: string;
  name: string;
  status: CourtStatus;
  order: number;
}

export type MatchStatus = 'queued' | 'scheduled' | 'in_progress' | 'finished' | 'cancelled';

/** Un lado del partido: 2 jugadores (rotativo) o 1 pareja fija. */
export interface MatchSide {
  playerIds: string[];
  teamId: string | null;
}

export type SetScore = [number, number];

export interface Match {
  id: string;
  status: MatchStatus;
  courtId: string | null;
  sides: [MatchSide, MatchSide];
  sets: SetScore[] | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  origin: 'auto' | 'manual';
  /** Posición en la cola (solo status=queued). */
  queueIndex: number | null;
  /** Explicación corta de por qué el motor eligió esta alineación. */
  reason: string | null;
}

export interface PointsAdjustment {
  id: string;
  /** id de jugador (rotativo) o de pareja (fijas). */
  targetId: string;
  delta: number;
  reason: string;
  at: number;
}

export type TournamentStatus = 'draft' | 'live' | 'finished';

export interface TournamentState {
  id: string;
  /** Cantidad de eventos aplicados. Sube con cada evento. */
  version: number;
  seed: string;
  status: TournamentStatus;
  config: TournamentConfig;
  players: Player[];
  teams: Team[];
  courts: Court[];
  matches: Match[];
  adjustments: PointsAdjustment[];
  /** Si está apagado, el motor no arma partidos solo (control manual total). */
  autoAssign: boolean;
  createdAt: number;
  /** Momento del último evento aplicado (reloj determinista para proyecciones). */
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

// ─── Derivados ──────────────────────────────────────────────────────────────

/**
 * Competidor = unidad que acumula puntos y aparece en el ranking:
 * el jugador (rotativo) o la pareja (fijas).
 */
export interface MatchSummary {
  matchId: string;
  at: number;
  courtId: string | null;
  partnerIds: string[];
  opponentIds: string[];
  sets: SetScore[];
  /** Resultado desde la perspectiva del competidor. */
  outcome: 'win' | 'draw' | 'loss';
  pointsEarned: number;
  /** Marcador desde la perspectiva del competidor: [propios, rivales] por set. */
  scoreFor: SetScore[];
}

export interface CompetitorStats {
  id: string;
  name: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  adjustmentPoints: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  setDiff: number;
  gameDiff: number;
  partners: Record<string, number>;
  opponents: Record<string, number>;
  lastMatchStartedAt: number | null;
  lastMatchEndedAt: number | null;
  /** Partidos seguidos (sin descanso real entre ellos), incluyendo el actual. */
  consecutive: number;
  /** Partido en cancha (scheduled/in_progress) en el que participa. */
  currentMatchId: string | null;
  /** Partido en cola en el que participa. */
  queuedMatchId: string | null;
  history: MatchSummary[];
}

export type PlayerDisplayStatus =
  | 'playing'
  | 'available'
  | 'next'
  | 'resting'
  | 'paused'
  | 'absent';

export interface RankingEntry {
  rank: number;
  competitorId: string;
  name: string;
  stats: CompetitorStats;
}
