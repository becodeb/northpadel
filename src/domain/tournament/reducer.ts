import { applySchedulingEffect } from '../scheduling/scheduling-engine.js';
import type { TournamentEvent } from './events.js';
import type { Match, TournamentState } from './types.js';

/**
 * Reducer puro: (estado, evento) → estado nuevo. Nunca lanza para eventos
 * desconocidos ni toma decisiones: solo registra hechos.
 */

export function initialStateFrom(event: Extract<TournamentEvent, { type: 'tournament_created' }>): TournamentState {
  return {
    id: event.id,
    version: 1,
    seed: event.seed,
    status: 'draft',
    config: event.config,
    players: event.players,
    teams: event.teams,
    courts: event.courts,
    matches: [],
    adjustments: [],
    autoAssign: true,
    createdAt: event.at,
    updatedAt: event.at,
    startedAt: null,
    finishedAt: null,
  };
}

function patchMatch(state: TournamentState, matchId: string, patch: (m: Match) => Match): TournamentState {
  return { ...state, matches: state.matches.map((m) => (m.id === matchId ? patch(m) : m)) };
}

function nextQueueIndex(state: TournamentState, front: boolean): number {
  const idx = state.matches.filter((m) => m.status === 'queued').map((m) => m.queueIndex ?? 0);
  if (!idx.length) return 0;
  return front ? Math.min(...idx) - 1 : Math.max(...idx) + 1;
}

export function reduce(state: TournamentState, event: TournamentEvent): TournamentState {
  const next = applyEvent(state, event);
  return { ...next, version: state.version + 1, updatedAt: event.at };
}

function applyEvent(state: TournamentState, event: TournamentEvent): TournamentState {
  switch (event.type) {
    case 'tournament_created':
      return initialStateFrom(event);

    case 'tournament_started':
      return { ...state, status: 'live', startedAt: event.at };

    case 'tournament_finished':
      return { ...state, status: 'finished', finishedAt: event.at };

    case 'tournament_reopened':
      return { ...state, status: 'live', finishedAt: null };

    case 'match_created':
      return applySchedulingEffect(state, { kind: 'create', match: event.match }, event.at);

    case 'match_assigned':
      return applySchedulingEffect(
        state,
        { kind: 'assign', matchId: event.matchId, courtId: event.courtId, start: event.start },
        event.at,
      );

    case 'match_started':
      return patchMatch(state, event.matchId, (m) => ({
        ...m,
        status: 'in_progress',
        startedAt: m.startedAt ?? event.at,
      }));

    case 'match_finished':
      return patchMatch(state, event.matchId, (m) => ({
        ...m,
        status: 'finished',
        sets: event.sets,
        startedAt: m.startedAt ?? event.at,
        finishedAt: event.at,
      }));

    case 'match_result_edited':
      return patchMatch(state, event.matchId, (m) => ({ ...m, sets: event.sets }));

    case 'match_cancelled':
      return patchMatch(state, event.matchId, (m) => ({
        ...m,
        status: 'cancelled',
        queueIndex: null,
        finishedAt: event.at,
      }));

    case 'match_lineup_changed':
      return patchMatch(state, event.matchId, (m) => ({ ...m, sides: event.sides, reason: 'Ajuste manual' }));

    case 'match_moved': {
      if (event.courtId === null) {
        const queueIndex = nextQueueIndex(state, event.front);
        return patchMatch(state, event.matchId, (m) => ({
          ...m,
          status: 'queued',
          courtId: null,
          startedAt: null,
          queueIndex,
        }));
      }
      return patchMatch(state, event.matchId, (m) => {
        const wasQueued = m.status === 'queued';
        const start = wasQueued ? state.config.pairing.autoStart : m.status === 'in_progress';
        return {
          ...m,
          status: start ? 'in_progress' : 'scheduled',
          courtId: event.courtId,
          queueIndex: null,
          startedAt: start ? (m.startedAt ?? event.at) : null,
        };
      });
    }

    case 'queue_reordered': {
      const order = new Map(event.matchIds.map((mid, i) => [mid, i]));
      return {
        ...state,
        matches: state.matches.map((m) =>
          m.status === 'queued' && order.has(m.id) ? { ...m, queueIndex: order.get(m.id)! } : m,
        ),
      };
    }

    case 'player_added':
      return { ...state, players: [...state.players, event.player] };

    case 'player_updated':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === event.playerId ? { ...p, name: event.name, level: event.level } : p,
        ),
      };

    case 'player_removed':
      return { ...state, players: state.players.filter((p) => p.id !== event.playerId) };

    case 'player_availability_changed':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === event.playerId
            ? { ...p, availability: event.availability, fairnessOffset: event.fairnessOffset }
            : p,
        ),
      };

    case 'team_added':
      return {
        ...state,
        players: [...state.players, ...event.players],
        teams: [...state.teams, event.team],
      };

    case 'team_removed': {
      const team = state.teams.find((t) => t.id === event.teamId);
      const memberIds = new Set(team?.playerIds ?? []);
      return {
        ...state,
        teams: state.teams.filter((t) => t.id !== event.teamId),
        players: state.players.filter((p) => !memberIds.has(p.id)),
      };
    }

    case 'points_adjusted':
      return { ...state, adjustments: [...state.adjustments, event.adjustment] };

    case 'court_added':
      return { ...state, courts: [...state.courts, event.court] };

    case 'court_updated':
      return {
        ...state,
        courts: state.courts.map((c) => (c.id === event.courtId ? { ...c, name: event.name } : c)),
      };

    case 'court_status_changed':
      return {
        ...state,
        courts: state.courts.map((c) => (c.id === event.courtId ? { ...c, status: event.status } : c)),
      };

    case 'config_updated':
      return { ...state, config: event.config };

    case 'auto_assign_changed':
      return { ...state, autoAssign: event.enabled };

    default:
      return state;
  }
}

/** Reconstruye el estado desde el log completo (ignorando eventos deshechos). */
export function replay(events: TournamentEvent[]): TournamentState {
  if (!events.length || events[0].type !== 'tournament_created') {
    throw new Error('El log debe empezar con tournament_created');
  }
  let state = initialStateFrom(events[0]);
  for (let i = 1; i < events.length; i++) state = reduce(state, events[i]);
  return state;
}
