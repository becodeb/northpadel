import { proposeLineup, signatureOf, type CompetitorView, type LineupProposal } from '../pairing/pairing-engine.js';
import { computeStrengths } from '../pairing/strength.js';
import { computeRanking } from '../ranking/ranking-engine.js';
import { createRng, deterministicId, type Rng } from '../shared/rng.js';
import {
  competitorIds,
  computeStats,
  fairnessCount,
  isCompetitorActive,
  restMs,
  type StatsIndex,
} from '../tournament/stats.js';
import type { Court, Match, MatchSide, TournamentState } from '../tournament/types.js';

/**
 * SchedulingEngine
 *
 * Responde a una sola pregunta: "¿qué partido va ahora y dónde?".
 *
 *  1. Cuando se libera una cancha, primero entra la cola MANUAL (partidos que el
 *     organizador armó o mandó a la cola). Si no hay, se arma el mejor partido
 *     posible EN ESE MOMENTO con todos los disponibles (incluidos los que recién
 *     terminaron, que el motor deja descansar salvo que estén atrasados).
 *  2. "Próximos" es una PROYECCIÓN determinista: qué partidos armaría el motor si
 *     se liberaran canchas ahora. No se persiste, así los jugadores que terminan
 *     nunca quedan encerrados en el mismo grupo (defecto clásico de las colas fijas).
 *
 * Todo lo que devuelve son *hechos* (partidos creados/asignados) para que el
 * reducer los aplique. No muta el estado.
 */

export interface SchedulingContext {
  now: number;
  rng: Rng;
}

export function rngFor(state: TournamentState, salt = ''): Rng {
  return createRng(`${state.seed}:${state.version}:${salt}`);
}

export function sideSizeOf(state: TournamentState): 1 | 2 {
  return state.config.mode === 'fixed_pairs' ? 1 : 2;
}

/** Cancha libre = disponible y sin partido asignado (scheduled / in_progress). */
export function freeCourts(state: TournamentState): Court[] {
  const busy = new Set(
    state.matches
      .filter((m) => (m.status === 'scheduled' || m.status === 'in_progress') && m.courtId)
      .map((m) => m.courtId as string),
  );
  return state.courts
    .filter((c) => c.status === 'available' && !busy.has(c.id))
    .sort((a, b) => a.order - b.order);
}

/** Cola manual (partidos creados por el organizador o devueltos a la cola). */
export function queuedMatches(state: TournamentState): Match[] {
  return state.matches
    .filter((m) => m.status === 'queued')
    .sort((a, b) => (a.queueIndex ?? 0) - (b.queueIndex ?? 0) || a.createdAt - b.createdAt);
}

export function activeCourts(state: TournamentState): Court[] {
  return state.courts.filter((c) => c.status === 'available');
}

export function finishedCount(state: TournamentState): number {
  return state.matches.filter((m) => m.status === 'finished').length;
}

/**
 * Clave del ruido determinista. Es fija por torneo: así una misma situación
 * (mismos disponibles, mismas estadísticas) produce siempre la misma propuesta
 * y "Próximos" no cambia de un segundo a otro. La variedad entre partidos viene
 * de que el estado cambia con cada resultado.
 */
export function jitterKeyOf(state: TournamentState): string {
  return `${state.seed}:jitter`;
}

/** Competidores que pueden entrar a un partido nuevo ahora mismo. */
export function availableCompetitorViews(
  state: TournamentState,
  stats: StatsIndex,
  now: number,
  exclude: Set<string> = new Set(),
): CompetitorView[] {
  const ranking = computeRanking(stats.list, {
    tiebreakers: state.config.tiebreakers,
    seed: state.seed,
  });
  const strengths = computeStrengths(state, stats.byId, ranking);
  const views: CompetitorView[] = [];
  for (const id of competitorIds(state)) {
    if (exclude.has(id)) continue;
    if (!isCompetitorActive(state, id)) continue;
    const s = stats.byId[id];
    if (!s || s.currentMatchId || s.queuedMatchId) continue;
    views.push({
      id,
      memberIds: memberIdsOf(state, id),
      name: s.name,
      fairnessCount: fairnessCount(state, s),
      restMs: restMs(state, s, now),
      consecutive: s.consecutive,
      partners: s.partners,
      opponents: s.opponents,
      strength: strengths[id] ?? 3,
    });
  }
  return views;
}

export function memberIdsOf(state: TournamentState, competitorId: string): string[] {
  if (state.config.mode === 'fixed_pairs') {
    return state.teams.find((t) => t.id === competitorId)?.playerIds.slice() ?? [];
  }
  return [competitorId];
}

export function sideFromCompetitors(state: TournamentState, ids: string[]): MatchSide {
  if (state.config.mode === 'fixed_pairs') {
    const team = state.teams.find((t) => t.id === ids[0]);
    return { playerIds: team ? team.playerIds.slice() : [], teamId: ids[0] ?? null };
  }
  return { playerIds: ids.slice(), teamId: null };
}

export interface GenerateOptions {
  courtId: string | null;
  queueIndex: number | null;
  avoidSignatures?: string[];
  exclude?: Set<string>;
  /** Alineación anunciada en "Próximos" que conviene respetar si sigue siendo justa. */
  preferred?: [string[], string[]] | null;
}

function propose(
  state: TournamentState,
  stats: StatsIndex,
  now: number,
  options: { avoidSignatures?: string[]; exclude?: Set<string>; preferred?: [string[], string[]] | null },
): LineupProposal | null {
  const candidates = availableCompetitorViews(state, stats, now, options.exclude);
  return proposeLineup({
    candidates,
    sideSize: sideSizeOf(state),
    rules: state.config.pairing,
    jitterKey: jitterKeyOf(state),
    avoidSignatures: options.avoidSignatures,
    preferred: options.preferred ?? null,
  });
}

/** Genera un partido nuevo (sin aplicarlo). null si no hay suficientes jugadores. */
export function generateMatch(
  state: TournamentState,
  stats: StatsIndex,
  ctx: SchedulingContext,
  options: GenerateOptions,
): Match | null {
  const proposal = propose(state, stats, ctx.now, options);
  if (!proposal) return null;

  const onCourt = options.courtId != null;
  const autoStart = onCourt && state.config.pairing.autoStart;
  return {
    id: deterministicId(ctx.rng, 'm'),
    status: onCourt ? (autoStart ? 'in_progress' : 'scheduled') : 'queued',
    courtId: options.courtId,
    sides: [
      sideFromCompetitors(state, proposal.sides[0]),
      sideFromCompetitors(state, proposal.sides[1]),
    ],
    sets: null,
    createdAt: ctx.now,
    startedAt: autoStart ? ctx.now : null,
    finishedAt: null,
    origin: 'auto',
    queueIndex: onCourt ? null : options.queueIndex,
    reason: proposal.reason,
  };
}

// ─── Proyección de próximos ─────────────────────────────────────────────────

export interface UpcomingMatch {
  /** Partido manual en cola (binding) o proyección del motor (estimada). */
  kind: 'queued' | 'projected';
  matchId: string | null;
  sides: [MatchSide, MatchSide];
  reason: string | null;
}

export function previewCountOf(state: TournamentState): number {
  return state.config.pairing.previewCount ?? Math.max(1, activeCourts(state).length);
}

/**
 * Qué se viene: primero la cola manual, después lo que el motor armaría si se
 * liberaran canchas ahora. Determinista para un mismo estado (usa updatedAt como
 * reloj), así todos los clientes muestran lo mismo.
 */
export function projectUpcoming(state: TournamentState, count = previewCountOf(state)): UpcomingMatch[] {
  const out: UpcomingMatch[] = [];
  if (state.status !== 'live') return out;
  for (const m of queuedMatches(state)) {
    out.push({ kind: 'queued', matchId: m.id, sides: m.sides, reason: m.reason });
  }
  if (!state.autoAssign) return out.slice(0, Math.max(count, out.length));

  const now = state.updatedAt;
  const stats = computeStats(state);
  const exclude = new Set<string>();
  for (const m of queuedMatches(state)) {
    for (const side of m.sides) for (const id of competitorIdsOf(state, side)) exclude.add(id);
  }
  let guard = 0;
  while (out.length < count && guard++ < 10) {
    const proposal = propose(state, stats, now, { exclude });
    if (!proposal) break;
    for (const id of [...proposal.sides[0], ...proposal.sides[1]]) exclude.add(id);
    out.push({
      kind: 'projected',
      matchId: null,
      sides: [sideFromCompetitors(state, proposal.sides[0]), sideFromCompetitors(state, proposal.sides[1])],
      reason: proposal.reason,
    });
  }
  return out;
}

function competitorIdsOf(state: TournamentState, side: MatchSide): string[] {
  return state.config.mode === 'fixed_pairs' ? (side.teamId ? [side.teamId] : []) : side.playerIds;
}

// ─── Plan de asignación ─────────────────────────────────────────────────────

export type SchedulingEffect =
  | { kind: 'assign'; matchId: string; courtId: string; start: boolean }
  | { kind: 'create'; match: Match };

export interface PlanOptions {
  /** Alineaciones a evitar al generar (cancelar / rehacer un partido). */
  avoidSignatures?: string[];
  /**
   * Lo que mostraba "Próximos" antes del comando. Se usa en orden para que el
   * partido anunciado sea el que entra a la cancha (si sigue siendo justo).
   */
  preferred?: UpcomingMatch[];
}

/**
 * Calcula qué hacer con las canchas libres. Devuelve efectos en orden.
 * `applyEffect` permite simular el estado intermedio sin depender del reducer real.
 */
export function planSchedule(
  state: TournamentState,
  ctx: SchedulingContext,
  applyEffect: (s: TournamentState, e: SchedulingEffect) => TournamentState,
  options: PlanOptions = {},
): SchedulingEffect[] {
  if (state.status !== 'live' || !state.autoAssign) return [];
  const effects: SchedulingEffect[] = [];
  let current = state;

  const push = (e: SchedulingEffect) => {
    effects.push(e);
    current = applyEffect(current, e);
  };
  const preferred = (options.preferred ?? []).filter((u) => u.kind === 'projected');

  for (const court of freeCourts(current)) {
    const queue = queuedMatches(current);
    if (queue.length) {
      push({ kind: 'assign', matchId: queue[0].id, courtId: court.id, start: current.config.pairing.autoStart });
      continue;
    }
    const stats = computeStats(current);
    const next = preferred.shift();
    const match = generateMatch(current, stats, ctx, {
      courtId: court.id,
      queueIndex: null,
      avoidSignatures: options.avoidSignatures,
      preferred: next ? [competitorIdsOf(current, next.sides[0]), competitorIdsOf(current, next.sides[1])] : null,
    });
    if (!match) break;
    push({ kind: 'create', match });
  }

  return effects;
}

/** Aplica un efecto de scheduling de forma pura (usado por el reducer y por planSchedule). */
export function applySchedulingEffect(state: TournamentState, effect: SchedulingEffect, now: number): TournamentState {
  if (effect.kind === 'create') {
    return { ...state, matches: [...state.matches, effect.match] };
  }
  return {
    ...state,
    matches: state.matches.map((m) =>
      m.id === effect.matchId
        ? {
            ...m,
            status: effect.start ? 'in_progress' : 'scheduled',
            courtId: effect.courtId,
            queueIndex: null,
            startedAt: effect.start ? now : null,
          }
        : m,
    ),
  };
}

export { signatureOf };
