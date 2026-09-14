import { signatureOf } from '../pairing/pairing-engine.js';
import {
  applySchedulingEffect,
  freeCourts,
  generateMatch,
  planSchedule,
  projectUpcoming,
  queuedMatches,
  rngFor,
  sideFromCompetitors,
  sideSizeOf,
  type SchedulingContext,
  type UpcomingMatch,
} from '../scheduling/scheduling-engine.js';
import { evaluateSets } from '../scoring/scoring-engine.js';
import { pairSplits } from '../shared/combinatorics.js';
import { assertDomain, DomainError } from '../shared/errors.js';
import { deterministicId } from '../shared/rng.js';
import type { Command } from './commands.js';
import type { TournamentEvent } from './events.js';
import { reduce } from './reducer.js';
import { competitorIdsOfSide, computeStats, fairnessCount, isCompetitorActive } from './stats.js';
import type { Match, MatchSide, Player, TournamentState } from './types.js';

/**
 * decide(estado, comando) → eventos
 *
 * Valida el comando contra el estado actual, produce los eventos "primarios"
 * y luego deja que el SchedulingEngine agregue los partidos que correspondan
 * (canchas libres, cola de próximos). Es determinista: mismo estado + mismo
 * comando ⇒ mismos eventos, así el cliente puede aplicarlo de forma optimista
 * y el servidor confirma.
 */

export interface DecideContext {
  now: number;
}

const OPEN_STATUSES = new Set(['queued', 'scheduled', 'in_progress']);

function findMatch(state: TournamentState, id: string): Match {
  const m = state.matches.find((x) => x.id === id);
  assertDomain(m, 'match_not_found', 'El partido no existe.');
  return m;
}

function findPlayer(state: TournamentState, id: string): Player {
  const p = state.players.find((x) => x.id === id);
  assertDomain(p, 'player_not_found', 'El jugador no existe.');
  return p;
}

function assertLive(state: TournamentState): void {
  assertDomain(state.status === 'live', 'not_live', 'El torneo no está en curso.');
}

function schedulingEvents(
  state: TournamentState,
  ctx: SchedulingContext,
  avoidSignatures: string[] = [],
  preferred: UpcomingMatch[] = [],
): TournamentEvent[] {
  const effects = planSchedule(state, ctx, (s, e) => applySchedulingEffect(s, e, ctx.now), {
    avoidSignatures,
    preferred,
  });
  return effects.map((e): TournamentEvent =>
    e.kind === 'create'
      ? { type: 'match_created', at: ctx.now, match: e.match }
      : { type: 'match_assigned', at: ctx.now, matchId: e.matchId, courtId: e.courtId, start: e.start },
  );
}

/** Aplica eventos primarios y agrega los de scheduling sobre el estado resultante. */
function withScheduling(
  state: TournamentState,
  primary: TournamentEvent[],
  ctx: SchedulingContext,
  avoidSignatures: string[] = [],
): TournamentEvent[] {
  // Lo que la pantalla anunciaba como "Próximos" antes de este comando.
  const preferred = state.status === 'live' ? projectUpcoming(state) : [];
  const after = primary.reduce(reduce, state);
  return [...primary, ...schedulingEvents(after, ctx, avoidSignatures, preferred)];
}

function minFairnessAmongActive(state: TournamentState, excludeId?: string): number {
  const stats = computeStats(state);
  const counts = stats.list
    .filter((s) => s.id !== excludeId && isCompetitorActive(state, s.id))
    .map((s) => fairnessCount(state, s));
  return counts.length ? Math.min(...counts) : 0;
}

function cancelOpenMatchesOfPlayer(
  state: TournamentState,
  playerId: string,
  at: number,
  opts: { includeInProgress: boolean },
): TournamentEvent[] {
  const events: TournamentEvent[] = [];
  for (const m of state.matches) {
    if (!OPEN_STATUSES.has(m.status)) continue;
    if (m.status === 'in_progress' && !opts.includeInProgress) continue;
    if (m.sides.some((s) => s.playerIds.includes(playerId))) {
      events.push({ type: 'match_cancelled', at, matchId: m.id, reason: 'Jugador no disponible' });
    }
  }
  return events;
}

function assertSidesValid(state: TournamentState, sides: [MatchSide, MatchSide], ignoreMatchId?: string): void {
  const all = [...sides[0].playerIds, ...sides[1].playerIds];
  assertDomain(
    sides[0].playerIds.length === 2 && sides[1].playerIds.length === 2,
    'invalid_sides',
    'Cada lado necesita 2 jugadores.',
  );
  assertDomain(new Set(all).size === all.length, 'duplicate_player', 'Un jugador no puede estar dos veces.');
  for (const pid of all) {
    const p = findPlayer(state, pid);
    assertDomain(p.availability === 'active', 'player_inactive', `${p.name} no está disponible.`);
    const busy = state.matches.find(
      (m) =>
        m.id !== ignoreMatchId &&
        (m.status === 'scheduled' || m.status === 'in_progress') &&
        m.sides.some((s) => s.playerIds.includes(pid)),
    );
    assertDomain(!busy, 'player_busy', `${p.name} ya está en cancha.`);
  }
}

export function decide(state: TournamentState, command: Command, ctx: DecideContext): TournamentEvent[] {
  const at = ctx.now;
  const sctx: SchedulingContext = { now: at, rng: rngFor(state, command.type) };

  switch (command.type) {
    case 'start_tournament': {
      assertDomain(state.status === 'draft', 'already_started', 'El torneo ya comenzó.');
      const perMatch = sideSizeOf(state) * 2;
      const activeCount =
        state.config.mode === 'fixed_pairs'
          ? state.teams.filter((t) => isCompetitorActive(state, t.id)).length
          : state.players.filter((p) => p.availability === 'active').length;
      assertDomain(
        activeCount >= perMatch,
        'not_enough_players',
        state.config.mode === 'fixed_pairs'
          ? 'Se necesitan al menos 2 parejas.'
          : 'Se necesitan al menos 4 jugadores.',
      );
      assertDomain(state.courts.length > 0, 'no_courts', 'Agregá al menos una cancha.');
      return withScheduling(state, [{ type: 'tournament_started', at }], sctx);
    }

    case 'finish_tournament': {
      assertLive(state);
      const cancels: TournamentEvent[] = state.matches
        .filter((m) => OPEN_STATUSES.has(m.status))
        .map((m) => ({ type: 'match_cancelled', at, matchId: m.id, reason: 'Torneo finalizado' }));
      return [...cancels, { type: 'tournament_finished', at }];
    }

    case 'reopen_tournament': {
      assertDomain(state.status === 'finished', 'not_finished', 'El torneo no está finalizado.');
      return withScheduling(state, [{ type: 'tournament_reopened', at }], sctx);
    }

    case 'record_result': {
      assertLive(state);
      const m = findMatch(state, command.matchId);
      assertDomain(
        m.status === 'scheduled' || m.status === 'in_progress',
        'match_not_open',
        'Este partido no está en juego.',
      );
      const outcome = evaluateSets(command.sets, state.config.format);
      if (!outcome.valid) throw new DomainError('invalid_score', outcome.error ?? 'Resultado inválido.');
      return withScheduling(state, [{ type: 'match_finished', at, matchId: m.id, sets: command.sets }], sctx);
    }

    case 'edit_result': {
      const m = findMatch(state, command.matchId);
      assertDomain(m.status === 'finished', 'not_finished', 'Solo se puede editar un partido finalizado.');
      const outcome = evaluateSets(command.sets, state.config.format);
      if (!outcome.valid) throw new DomainError('invalid_score', outcome.error ?? 'Resultado inválido.');
      return [{ type: 'match_result_edited', at, matchId: m.id, sets: command.sets }];
    }

    case 'start_match': {
      assertLive(state);
      const m = findMatch(state, command.matchId);
      assertDomain(m.status === 'scheduled', 'not_scheduled', 'El partido no está listo para iniciar.');
      return [{ type: 'match_started', at, matchId: m.id }];
    }

    case 'cancel_match': {
      const m = findMatch(state, command.matchId);
      assertDomain(OPEN_STATUSES.has(m.status), 'not_open', 'El partido ya terminó.');
      const primary: TournamentEvent = {
        type: 'match_cancelled',
        at,
        matchId: m.id,
        reason: command.reason ?? null,
      };
      // Evitar que la cola regenere exactamente el mismo partido.
      const avoid = [signatureOf(sidesToCompetitorIds(state, m))];
      return withScheduling(state, [primary], sctx, avoid);
    }

    case 'regenerate_match': {
      assertLive(state);
      const m = findMatch(state, command.matchId);
      assertDomain(OPEN_STATUSES.has(m.status), 'not_open', 'El partido ya terminó.');
      const cancel: TournamentEvent = { type: 'match_cancelled', at, matchId: m.id, reason: 'Rehecho' };
      const after = reduce(state, cancel);
      const avoid = [signatureOf(sidesToCompetitorIds(state, m))];
      const stats = computeStats(after);
      const replacement = generateMatch(after, stats, sctx, {
        courtId: m.courtId,
        queueIndex: m.status === 'queued' ? m.queueIndex : null,
        avoidSignatures: avoid,
      });
      assertDomain(replacement, 'not_enough_players', 'No hay jugadores disponibles para rehacer el partido.');
      const created: TournamentEvent = { type: 'match_created', at, match: replacement };
      return withScheduling(state, [cancel, created], sctx, avoid);
    }

    case 'swap_player': {
      const m = findMatch(state, command.matchId);
      assertDomain(OPEN_STATUSES.has(m.status), 'not_open', 'El partido ya terminó.');
      let sides: [MatchSide, MatchSide];
      if (state.config.mode === 'fixed_pairs') {
        const outTeam = state.teams.find((t) => t.id === command.outId);
        const inTeam = state.teams.find((t) => t.id === command.inId);
        assertDomain(outTeam && inTeam, 'team_not_found', 'La pareja no existe.');
        assertDomain(isCompetitorActive(state, inTeam.id), 'team_inactive', 'La pareja no está disponible.');
        sides = m.sides.map((s) =>
          s.teamId === outTeam.id ? sideFromCompetitors(state, [inTeam.id]) : s,
        ) as [MatchSide, MatchSide];
        assertDomain(sides.some((s) => s.teamId === inTeam.id), 'not_in_match', 'La pareja no está en el partido.');
      } else {
        findPlayer(state, command.outId);
        findPlayer(state, command.inId);
        assertDomain(
          m.sides.some((s) => s.playerIds.includes(command.outId)),
          'not_in_match',
          'El jugador no está en este partido.',
        );
        sides = m.sides.map((s) => ({
          ...s,
          playerIds: s.playerIds.map((pid) => (pid === command.outId ? command.inId : pid)),
        })) as [MatchSide, MatchSide];
      }
      assertSidesValid(state, sides, m.id);
      // Si el que entra estaba en un partido en cola, ese partido se cancela.
      const primary: TournamentEvent[] = [];
      for (const q of state.matches) {
        if (q.status !== 'queued' || q.id === m.id) continue;
        const inIds = state.config.mode === 'fixed_pairs' ? memberIdsOfTeam(state, command.inId) : [command.inId];
        if (q.sides.some((s) => s.playerIds.some((pid) => inIds.includes(pid)))) {
          primary.push({ type: 'match_cancelled', at, matchId: q.id, reason: 'Jugador reasignado' });
        }
      }
      primary.push({ type: 'match_lineup_changed', at, matchId: m.id, sides });
      return withScheduling(state, primary, sctx);
    }

    case 'rotate_pairs': {
      assertDomain(state.config.mode === 'rotating', 'not_rotating', 'Solo en torneos de parejas rotativas.');
      const m = findMatch(state, command.matchId);
      assertDomain(OPEN_STATUSES.has(m.status), 'not_open', 'El partido ya terminó.');
      const four = [...m.sides[0].playerIds, ...m.sides[1].playerIds].sort();
      const splits = pairSplits(four);
      const currentSig = signatureOf([m.sides[0].playerIds, m.sides[1].playerIds]);
      const idx = splits.findIndex(([a, b]) => signatureOf([a, b]) === currentSig);
      const [a, b] = splits[(idx + 1) % splits.length];
      const sides: [MatchSide, MatchSide] = [
        { playerIds: a, teamId: null },
        { playerIds: b, teamId: null },
      ];
      return [{ type: 'match_lineup_changed', at, matchId: m.id, sides }];
    }

    case 'swap_sides': {
      const m = findMatch(state, command.matchId);
      assertDomain(OPEN_STATUSES.has(m.status), 'not_open', 'El partido ya terminó.');
      return [{ type: 'match_lineup_changed', at, matchId: m.id, sides: [m.sides[1], m.sides[0]] }];
    }

    case 'move_match': {
      const m = findMatch(state, command.matchId);
      assertDomain(OPEN_STATUSES.has(m.status), 'not_open', 'El partido ya terminó.');
      if (command.courtId !== null) {
        const court = state.courts.find((c) => c.id === command.courtId);
        assertDomain(court, 'court_not_found', 'La cancha no existe.');
        assertDomain(court.status === 'available', 'court_unavailable', 'La cancha no está disponible.');
        const free = freeCourts(state).some((c) => c.id === court.id);
        assertDomain(free, 'court_busy', 'La cancha está ocupada.');
      } else {
        assertDomain(m.status !== 'queued', 'already_queued', 'El partido ya está en la cola.');
      }
      return withScheduling(
        state,
        [{ type: 'match_moved', at, matchId: m.id, courtId: command.courtId, front: true }],
        sctx,
      );
    }

    case 'create_match': {
      assertDomain(state.status !== 'finished', 'finished', 'El torneo está finalizado.');
      const sides: [MatchSide, MatchSide] = [
        sideFromCompetitors(state, command.sides[0]),
        sideFromCompetitors(state, command.sides[1]),
      ];
      if (state.config.mode === 'fixed_pairs') {
        assertDomain(
          sides[0].teamId && sides[1].teamId && sides[0].teamId !== sides[1].teamId,
          'invalid_sides',
          'Elegí dos parejas distintas.',
        );
      }
      assertSidesValid(state, sides);
      let courtId: string | null = null;
      if (command.courtId) {
        const court = state.courts.find((c) => c.id === command.courtId);
        assertDomain(court, 'court_not_found', 'La cancha no existe.');
        assertDomain(freeCourts(state).some((c) => c.id === court.id), 'court_busy', 'La cancha está ocupada.');
        courtId = court.id;
      }
      const primary: TournamentEvent[] = [];
      const involved = new Set([...sides[0].playerIds, ...sides[1].playerIds]);
      for (const q of state.matches) {
        if (q.status !== 'queued') continue;
        if (q.sides.some((s) => s.playerIds.some((pid) => involved.has(pid)))) {
          primary.push({ type: 'match_cancelled', at, matchId: q.id, reason: 'Jugador reasignado' });
        }
      }
      const onCourt = courtId !== null && state.status === 'live';
      const start = onCourt && state.config.pairing.autoStart;
      const queue = queuedMatches(state);
      const match: Match = {
        id: deterministicId(sctx.rng, 'm'),
        status: onCourt ? (start ? 'in_progress' : 'scheduled') : 'queued',
        courtId: onCourt ? courtId : null,
        sides,
        sets: null,
        createdAt: at,
        startedAt: start ? at : null,
        finishedAt: null,
        origin: 'manual',
        queueIndex: onCourt ? null : (queue.length ? Math.min(...queue.map((q) => q.queueIndex ?? 0)) - 1 : 0),
        reason: 'Partido manual',
      };
      primary.push({ type: 'match_created', at, match });
      return withScheduling(state, primary, sctx);
    }

    case 'reorder_queue': {
      const queued = new Set(queuedMatches(state).map((m) => m.id));
      for (const mid of command.matchIds) assertDomain(queued.has(mid), 'not_queued', 'Partido no está en la cola.');
      return [{ type: 'queue_reordered', at, matchIds: command.matchIds }];
    }

    case 'add_player': {
      assertDomain(state.config.mode === 'rotating', 'not_rotating', 'En parejas fijas se agregan parejas.');
      assertDomain(state.status !== 'finished', 'finished', 'El torneo está finalizado.');
      const player: Player = {
        id: deterministicId(sctx.rng, 'p'),
        name: command.name,
        level: command.level ?? null,
        availability: 'active',
        joinedAt: at,
        fairnessOffset: state.status === 'live' ? minFairnessAmongActive(state) : 0,
        teamId: null,
      };
      return withScheduling(state, [{ type: 'player_added', at, player }], sctx);
    }

    case 'add_team': {
      assertDomain(state.config.mode === 'fixed_pairs', 'not_fixed', 'Este torneo es individual.');
      assertDomain(state.status !== 'finished', 'finished', 'El torneo está finalizado.');
      const teamId = deterministicId(sctx.rng, 't');
      const offset = state.status === 'live' ? minFairnessAmongActive(state) : 0;
      const players: Player[] = command.players.map((p) => ({
        id: deterministicId(sctx.rng, 'p'),
        name: p.name,
        level: p.level ?? null,
        availability: 'active',
        joinedAt: at,
        fairnessOffset: offset,
        teamId,
      }));
      const team = { id: teamId, name: command.name ?? null, playerIds: [players[0].id, players[1].id] as [string, string] };
      return withScheduling(state, [{ type: 'team_added', at, team, players }], sctx);
    }

    case 'update_player': {
      findPlayer(state, command.playerId);
      return [{ type: 'player_updated', at, playerId: command.playerId, name: command.name, level: command.level }];
    }

    case 'remove_player': {
      const p = findPlayer(state, command.playerId);
      assertDomain(state.config.mode === 'rotating', 'not_rotating', 'En parejas fijas se quita la pareja.');
      const hasMatches = state.matches.some((m) => m.sides.some((s) => s.playerIds.includes(p.id)));
      assertDomain(!hasMatches, 'has_matches', 'El jugador ya tiene partidos: marcalo como ausente.');
      return [{ type: 'player_removed', at, playerId: p.id }];
    }

    case 'remove_team': {
      const team = state.teams.find((t) => t.id === command.teamId);
      assertDomain(team, 'team_not_found', 'La pareja no existe.');
      const hasMatches = state.matches.some((m) => m.sides.some((s) => s.teamId === team.id));
      assertDomain(!hasMatches, 'has_matches', 'La pareja ya tiene partidos: marcala como ausente.');
      return [{ type: 'team_removed', at, teamId: team.id }];
    }

    case 'set_availability': {
      const p = findPlayer(state, command.playerId);
      if (p.availability === command.availability) return [];
      const primary: TournamentEvent[] = [];
      let fairnessOffset = p.fairnessOffset;
      if (command.availability !== 'active') {
        primary.push(...cancelOpenMatchesOfPlayer(state, p.id, at, { includeInProgress: false }));
      } else if (state.status === 'live') {
        // Vuelve al nivel mínimo de partidos del resto: ni castigo ni ventaja.
        const stats = computeStats(state);
        const competitorId = state.config.mode === 'fixed_pairs' ? p.teamId ?? p.id : p.id;
        const mine = stats.byId[competitorId]?.matchesPlayed ?? 0;
        const min = minFairnessAmongActive(state, competitorId);
        fairnessOffset = Math.max(0, min - mine);
      }
      primary.push({
        type: 'player_availability_changed',
        at,
        playerId: p.id,
        availability: command.availability,
        fairnessOffset,
      });
      return withScheduling(state, primary, sctx);
    }

    case 'adjust_points': {
      const exists =
        state.config.mode === 'fixed_pairs'
          ? state.teams.some((t) => t.id === command.targetId)
          : state.players.some((p) => p.id === command.targetId);
      assertDomain(exists, 'target_not_found', 'No existe el competidor.');
      return [
        {
          type: 'points_adjusted',
          at,
          adjustment: {
            id: deterministicId(sctx.rng, 'adj'),
            targetId: command.targetId,
            delta: command.delta,
            reason: command.reason,
            at,
          },
        },
      ];
    }

    case 'add_court': {
      const order = state.courts.length ? Math.max(...state.courts.map((c) => c.order)) + 1 : 1;
      const court = {
        id: deterministicId(sctx.rng, 'c'),
        name: command.name?.trim() || `Cancha ${order}`,
        status: 'available' as const,
        order,
      };
      return withScheduling(state, [{ type: 'court_added', at, court }], sctx);
    }

    case 'rename_court': {
      assertDomain(state.courts.some((c) => c.id === command.courtId), 'court_not_found', 'La cancha no existe.');
      return [{ type: 'court_updated', at, courtId: command.courtId, name: command.name }];
    }

    case 'set_court_status': {
      const court = state.courts.find((c) => c.id === command.courtId);
      assertDomain(court, 'court_not_found', 'La cancha no existe.');
      if (court.status === command.status) return [];
      const primary: TournamentEvent[] = [];
      if (command.status !== 'available') {
        const scheduled = state.matches.find((m) => m.courtId === court.id && m.status === 'scheduled');
        if (scheduled) primary.push({ type: 'match_moved', at, matchId: scheduled.id, courtId: null, front: true });
      }
      primary.push({ type: 'court_status_changed', at, courtId: court.id, status: command.status });
      return withScheduling(state, primary, sctx);
    }

    case 'update_config': {
      assertDomain(
        state.status === 'draft' || command.config.mode === state.config.mode,
        'mode_locked',
        'El modo no se puede cambiar una vez creado el torneo.',
      );
      return withScheduling(state, [{ type: 'config_updated', at, config: command.config }], sctx);
    }

    case 'set_auto_assign': {
      if (state.autoAssign === command.enabled) return [];
      return withScheduling(state, [{ type: 'auto_assign_changed', at, enabled: command.enabled }], sctx);
    }
  }
}

function sidesToCompetitorIds(state: TournamentState, m: Match): [string[], string[]] {
  return [competitorIdsOfSide(state, m.sides[0]), competitorIdsOfSide(state, m.sides[1])];
}

function memberIdsOfTeam(state: TournamentState, teamId: string): string[] {
  return state.teams.find((t) => t.id === teamId)?.playerIds.slice() ?? [];
}
