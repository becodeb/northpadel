import { z } from 'zod';
import type {
  MatchFormat,
  PairingRules,
  PairingStrategy,
  PairingWeights,
  PresetId,
  ScoringRules,
  TiebreakCriterion,
  TournamentConfig,
  TournamentMode,
} from './types.js';

// ─── Schemas (validación en cliente y servidor) ─────────────────────────────

export const matchFormatSchema = z.object({
  kind: z.enum(['sets', 'games', 'points']),
  bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  gamesPerSet: z.number().int().min(1).max(20),
  tiebreak: z.boolean(),
  superTiebreak: z.boolean(),
  timed: z.boolean(),
  timeMinutes: z.number().int().min(1).max(240).nullable(),
  allowDraw: z.boolean(),
  targetPoints: z.number().int().min(1).max(500),
  strict: z.boolean(),
}) satisfies z.ZodType<MatchFormat>;

export const scoringRulesSchema = z.object({
  win: z.number(),
  draw: z.number(),
  loss: z.number(),
  perSetWon: z.number(),
  perSetLost: z.number(),
  perGameWon: z.number(),
  perGameLost: z.number(),
  perGameDiff: z.number(),
  straightSetsBonus: z.number(),
}) satisfies z.ZodType<ScoringRules>;

export const pairingWeightsSchema = z.object({
  matchBalance: z.number().min(0).max(100),
  partnerRepeat: z.number().min(0).max(100),
  opponentRepeat: z.number().min(0).max(100),
  rest: z.number().min(0).max(100),
  level: z.number().min(0).max(100),
}) satisfies z.ZodType<PairingWeights>;

export const pairingStrategySchema = z.enum([
  'random',
  'balanced',
  'by_level',
  'top_bottom',
  'max_rotation',
  'custom',
]) satisfies z.ZodType<PairingStrategy>;

export const pairingRulesSchema = z.object({
  strategy: pairingStrategySchema,
  weights: pairingWeightsSchema,
  maxConsecutive: z.number().int().min(1).max(10),
  strengthSource: z.enum(['auto', 'ranking', 'level']),
  previewCount: z.number().int().min(0).max(10).nullable(),
  autoStart: z.boolean(),
}) satisfies z.ZodType<PairingRules>;

export const tiebreakCriterionSchema = z.enum([
  'points',
  'wins',
  'setDiff',
  'gameDiff',
  'gamesWon',
  'headToHead',
  'random',
]) satisfies z.ZodType<TiebreakCriterion>;

export const tournamentConfigSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  mode: z.enum(['rotating', 'fixed_pairs']),
  preset: z.enum(['north_open', 'americano', 'mexicano', 'fixed_pairs', 'custom']),
  format: matchFormatSchema,
  scoring: scoringRulesSchema,
  pairing: pairingRulesSchema,
  tiebreakers: z.array(tiebreakCriterionSchema).min(1),
  restMinutes: z.number().int().min(0).max(60),
  scheduledAt: z.number().nullable(),
  description: z.string().max(500),
}) satisfies z.ZodType<TournamentConfig>;

// ─── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_FORMAT: MatchFormat = {
  kind: 'games',
  bestOf: 1,
  gamesPerSet: 6,
  tiebreak: true,
  superTiebreak: false,
  timed: false,
  timeMinutes: null,
  allowDraw: false,
  targetPoints: 32,
  strict: false,
};

export const DEFAULT_SCORING: ScoringRules = {
  win: 3,
  draw: 1,
  loss: 0,
  perSetWon: 0,
  perSetLost: 0,
  perGameWon: 0,
  perGameLost: 0,
  perGameDiff: 0,
  straightSetsBonus: 0,
};

export const DEFAULT_WEIGHTS: PairingWeights = {
  matchBalance: 40,
  partnerRepeat: 30,
  opponentRepeat: 15,
  rest: 10,
  level: 5,
};

export const DEFAULT_PAIRING: PairingRules = {
  strategy: 'balanced',
  weights: DEFAULT_WEIGHTS,
  maxConsecutive: 2,
  strengthSource: 'auto',
  previewCount: null,
  autoStart: true,
};

export const DEFAULT_TIEBREAKERS: TiebreakCriterion[] = [
  'points',
  'wins',
  'setDiff',
  'gameDiff',
  'gamesWon',
  'headToHead',
  'random',
];

export const ALL_TIEBREAKERS: TiebreakCriterion[] = [
  'points',
  'wins',
  'setDiff',
  'gameDiff',
  'gamesWon',
  'headToHead',
  'random',
];

export const TIEBREAKER_LABELS: Record<TiebreakCriterion, string> = {
  points: 'Puntos',
  wins: 'Victorias',
  setDiff: 'Diferencia de sets',
  gameDiff: 'Diferencia de games',
  gamesWon: 'Games ganados',
  headToHead: 'Enfrentamiento directo',
  random: 'Sorteo',
};

export const STRATEGY_LABELS: Record<PairingStrategy, { title: string; description: string }> = {
  random: {
    title: 'Random',
    description: 'Parejas al azar, evitando repetir compañeros y repartiendo los partidos.',
  },
  balanced: {
    title: 'Equilibrado',
    description: 'Arma los dos lados con fuerza similar: #1 + #15 contra #4 + #12.',
  },
  by_level: {
    title: 'Por nivel',
    description: 'Jugadores de posiciones similares juegan entre sí (estilo Mexicano).',
  },
  top_bottom: {
    title: 'Mejor + peor',
    description: 'Mezcla ranking alto con ranking bajo en cada pareja: #1 + #20.',
  },
  max_rotation: {
    title: 'Rotación máxima',
    description: 'Prioriza que cada uno juegue con la mayor cantidad de compañeros distintos.',
  },
  custom: {
    title: 'Personalizado',
    description: 'Definí vos el peso de cada criterio.',
  },
};

export const PRESET_LABELS: Record<PresetId, { title: string; description: string }> = {
  north_open: {
    title: 'Cancha Abierta North',
    description: 'Individual con parejas rotativas y partidos equilibrados. 1 set a 6 games.',
  },
  americano: {
    title: 'Americano',
    description: 'Individual, parejas rotativas, cada partido a 32 puntos. Suman los puntos jugados.',
  },
  mexicano: {
    title: 'Mexicano / Ranking dinámico',
    description: 'Los cruces se arman por posición en la tabla. Cada partido a 24 puntos.',
  },
  fixed_pairs: {
    title: 'Parejas fijas',
    description: 'Cada pareja se anota junta y suma puntos como equipo. 1 set a 6.',
  },
  custom: {
    title: 'Personalizado',
    description: 'Configurá modo, formato, puntos y emparejamiento desde cero.',
  },
};

export function buildConfig(partial: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    name: 'Cancha Abierta',
    mode: 'rotating',
    preset: 'north_open',
    format: { ...DEFAULT_FORMAT },
    scoring: { ...DEFAULT_SCORING },
    pairing: { ...DEFAULT_PAIRING, weights: { ...DEFAULT_WEIGHTS } },
    tiebreakers: [...DEFAULT_TIEBREAKERS],
    restMinutes: 3,
    scheduledAt: null,
    description: '',
    ...partial,
  };
}

/** Presets del club. Todos editables después: solo son un punto de partida. */
export function presetConfig(preset: PresetId): TournamentConfig {
  switch (preset) {
    case 'north_open':
      return buildConfig({
        name: 'Cancha Abierta',
        preset,
        mode: 'rotating',
        format: { ...DEFAULT_FORMAT, kind: 'games', gamesPerSet: 6, tiebreak: true },
        scoring: { ...DEFAULT_SCORING, win: 3, draw: 1, loss: 0 },
        pairing: { ...DEFAULT_PAIRING, strategy: 'balanced', weights: { ...DEFAULT_WEIGHTS } },
        tiebreakers: ['points', 'wins', 'gameDiff', 'gamesWon', 'headToHead', 'random'],
      });
    case 'americano':
      return buildConfig({
        name: 'Americano',
        preset,
        mode: 'rotating',
        format: { ...DEFAULT_FORMAT, kind: 'points', targetPoints: 32, allowDraw: true },
        scoring: { ...DEFAULT_SCORING, win: 0, draw: 0, loss: 0, perGameWon: 1 },
        pairing: { ...DEFAULT_PAIRING, strategy: 'max_rotation', weights: { ...DEFAULT_WEIGHTS } },
        tiebreakers: ['points', 'wins', 'gameDiff', 'headToHead', 'random'],
      });
    case 'mexicano':
      return buildConfig({
        name: 'Mexicano',
        preset,
        mode: 'rotating',
        format: { ...DEFAULT_FORMAT, kind: 'points', targetPoints: 24, allowDraw: true },
        scoring: { ...DEFAULT_SCORING, win: 0, draw: 0, loss: 0, perGameWon: 1 },
        pairing: {
          ...DEFAULT_PAIRING,
          strategy: 'by_level',
          strengthSource: 'ranking',
          weights: { ...DEFAULT_WEIGHTS },
        },
        tiebreakers: ['points', 'wins', 'gameDiff', 'headToHead', 'random'],
      });
    case 'fixed_pairs':
      return buildConfig({
        name: 'Torneo de parejas',
        preset,
        mode: 'fixed_pairs',
        format: { ...DEFAULT_FORMAT, kind: 'games', gamesPerSet: 6, tiebreak: true },
        scoring: { ...DEFAULT_SCORING, win: 3, draw: 1, loss: 0 },
        pairing: { ...DEFAULT_PAIRING, strategy: 'balanced', weights: { ...DEFAULT_WEIGHTS } },
        tiebreakers: ['points', 'wins', 'gameDiff', 'gamesWon', 'headToHead', 'random'],
      });
    case 'custom':
    default:
      return buildConfig({ name: 'Torneo', preset: 'custom' });
  }
}

export function modeLabel(mode: TournamentMode): string {
  return mode === 'rotating' ? 'Individual · parejas rotativas' : 'Parejas fijas';
}
