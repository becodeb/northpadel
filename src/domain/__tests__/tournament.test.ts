import { describe, expect, it } from 'vitest';
import { DomainError } from '../shared/errors.js';
import { buildSimulationInput, TournamentSimulator } from '../simulation/simulator.js';
import { createRng } from '../shared/rng.js';
import { presetConfig } from '../tournament/config.js';
import { replay } from '../tournament/reducer.js';
import { computeStats, fairnessCount, displayStatus } from '../tournament/stats.js';
import { computeRanking } from '../ranking/ranking-engine.js';
import { computeFairnessWarnings } from '../fairness/fairness-engine.js';
import { queuedMatches, freeCourts, projectUpcoming } from '../scheduling/scheduling-engine.js';
import type { TournamentState } from '../tournament/types.js';

function sim(players: number, courts: number, extra: Parameters<typeof buildSimulationInput>[0] = {}) {
  const input = buildSimulationInput({ players, courts, ...extra }, createRng(`t${players}${courts}`));
  const s = new TournamentSimulator(input, { seed: `seed-${players}-${courts}` });
  return s;
}

function onCourt(state: TournamentState) {
  return state.matches.filter((m) => m.status === 'in_progress' || m.status === 'scheduled');
}

function playersInOpenMatches(state: TournamentState): string[] {
  return state.matches
    .filter((m) => m.status !== 'finished' && m.status !== 'cancelled')
    .flatMap((m) => m.sides.flatMap((s) => s.playerIds));
}

describe('Torneo · inicio y asignación', () => {
  it('no arranca sin 4 jugadores', () => {
    const s = sim(3, 1);
    expect(() => s.start()).toThrow(DomainError);
  });

  it('28 jugadores / 4 canchas: llena las 4 canchas y proyecta 3 próximos', () => {
    const s = sim(28, 4);
    s.start();
    expect(s.state.status).toBe('live');
    expect(onCourt(s.state)).toHaveLength(4);
    const ids = playersInOpenMatches(s.state);
    expect(new Set(ids).size).toBe(ids.length); // nadie está en dos partidos
    expect(ids).toHaveLength(16);
    const upcoming = projectUpcoming(s.state);
    expect(upcoming).toHaveLength(3);
    const upcomingIds = upcoming.flatMap((u) => u.sides.flatMap((x) => x.playerIds));
    expect(new Set([...ids, ...upcomingIds]).size).toBe(28);
    // la proyección es estable para el mismo estado
    expect(projectUpcoming(s.state)).toEqual(upcoming);
  });

  it('la proyección coincide con lo que el motor arma al liberarse la cancha', () => {
    const s = sim(28, 4);
    s.start();
    s.runMatches(6);
    const projected = projectUpcoming(s.state)[0];
    const m = onCourt(s.state)[0];
    s.dispatch({ type: 'record_result', matchId: m.id, sets: [[6, 2]] });
    const created = onCourt(s.state).find((x) => x.courtId === m.courtId)!;
    const sig = (sides: { playerIds: string[] }[]) =>
      sides.map((x) => x.playerIds.slice().sort().join('+')).sort().join(' vs ');
    expect(sig(created.sides)).toBe(sig(projected.sides));
  });

  it('5 jugadores / 1 cancha: uno espera y entra en el siguiente', () => {
    const s = sim(5, 1);
    s.start();
    expect(onCourt(s.state)).toHaveLength(1);
    const waiting = s.state.players.find((p) => !playersInOpenMatches(s.state).includes(p.id))!;
    s.step();
    expect(onCourt(s.state)).toHaveLength(1);
    expect(playersInOpenMatches(s.state)).toContain(waiting.id);
  });

  it('7 jugadores / 2 canchas: solo se usa una cancha, nadie queda con 2 partidos de diferencia', () => {
    const s = sim(7, 2);
    s.start();
    expect(onCourt(s.state)).toHaveLength(1);
    s.runMatches(20);
    const stats = computeStats(s.state);
    const counts = stats.list.map((x) => x.matchesPlayed);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('13 jugadores / 3 canchas: 12 juegan, 1 espera; el que espera entra siempre en el siguiente', () => {
    const s = sim(13, 3);
    s.start();
    expect(onCourt(s.state)).toHaveLength(3);
    for (let i = 0; i < 30; i++) {
      const busy = new Set(playersInOpenMatches(s.state));
      const waiting = s.state.players.find((p) => !busy.has(p.id))!;
      s.step();
      expect(playersInOpenMatches(s.state)).toContain(waiting.id);
    }
    expect(s.metrics().matchSpread).toBeLessThanOrEqual(2);
  });

  it('al cargar un resultado la cancha se vuelve a ocupar en el mismo comando', () => {
    const s = sim(28, 4);
    s.start();
    const m = onCourt(s.state)[0];
    const events = s.dispatch({ type: 'record_result', matchId: m.id, sets: [[6, 3]] });
    expect(events[0].type).toBe('match_finished');
    expect(events.some((e) => e.type === 'match_assigned' || e.type === 'match_created')).toBe(true);
    expect(freeCourts(s.state)).toHaveLength(0);
    expect(onCourt(s.state)).toHaveLength(4);
  });

  it('rechaza resultados inválidos y empates no permitidos', () => {
    const s = sim(8, 1);
    s.start();
    const m = onCourt(s.state)[0];
    expect(() => s.dispatch({ type: 'record_result', matchId: m.id, sets: [[4, 4]] })).toThrow(/Empate/);
    expect(() => s.dispatch({ type: 'record_result', matchId: m.id, sets: [[0, 0]] })).toThrow(DomainError);
  });
});

describe('Torneo · control manual', () => {
  it('editar un resultado recalcula puntos', () => {
    const s = sim(8, 1);
    s.start();
    const m = onCourt(s.state)[0];
    const winnerId = m.sides[0].playerIds[0];
    s.dispatch({ type: 'record_result', matchId: m.id, sets: [[6, 2]] });
    expect(computeStats(s.state).byId[winnerId].points).toBe(3);
    s.dispatch({ type: 'edit_result', matchId: m.id, sets: [[2, 6]] });
    expect(computeStats(s.state).byId[winnerId].points).toBe(0);
    expect(computeStats(s.state).byId[winnerId].losses).toBe(1);
  });

  it('cancelar un partido libera la cancha y no repite la misma alineación', () => {
    const s = sim(8, 1);
    s.start();
    const m = onCourt(s.state)[0];
    const sig = m.sides.map((x) => x.playerIds.slice().sort().join('+')).sort().join(' vs ');
    s.dispatch({ type: 'cancel_match', matchId: m.id });
    expect(s.state.matches.find((x) => x.id === m.id)!.status).toBe('cancelled');
    const next = onCourt(s.state)[0];
    expect(next).toBeDefined();
    const sig2 = next.sides.map((x) => x.playerIds.slice().sort().join('+')).sort().join(' vs ');
    expect(sig2).not.toBe(sig);
  });

  it('rehacer partido arma otro distinto en la misma cancha', () => {
    const s = sim(12, 2);
    s.start();
    const m = onCourt(s.state)[0];
    s.dispatch({ type: 'regenerate_match', matchId: m.id });
    const replacement = onCourt(s.state).find((x) => x.courtId === m.courtId)!;
    expect(replacement.id).not.toBe(m.id);
    expect(onCourt(s.state)).toHaveLength(2);
  });

  it('cambiar un jugador por uno disponible', () => {
    const s = sim(10, 2);
    s.start();
    const m = onCourt(s.state)[0];
    const busy = new Set(playersInOpenMatches(s.state));
    const free = s.state.players.find((p) => !busy.has(p.id))!;
    const out = m.sides[1].playerIds[0];
    s.dispatch({ type: 'swap_player', matchId: m.id, outId: out, inId: free.id });
    const after = s.state.matches.find((x) => x.id === m.id)!;
    expect(after.sides[1].playerIds).toContain(free.id);
    expect(after.sides.flatMap((x) => x.playerIds)).not.toContain(out);
  });

  it('cambiar parejas rota entre las 3 combinaciones', () => {
    const s = sim(8, 1);
    s.start();
    const m = onCourt(s.state)[0];
    const sigs = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const cur = s.state.matches.find((x) => x.id === m.id)!;
      sigs.add(cur.sides.map((x) => x.playerIds.slice().sort().join('+')).sort().join(' vs '));
      s.dispatch({ type: 'rotate_pairs', matchId: m.id });
    }
    expect(sigs.size).toBe(3);
  });

  it('cancha fuera de servicio: el partido listo vuelve a la cola y se reasigna al reactivarla', () => {
    const s = sim(12, 2, { config: { pairing: { autoStart: false } as never } });
    s.start();
    expect(onCourt(s.state).every((m) => m.status === 'scheduled')).toBe(true);
    const court = s.state.courts[1];
    s.dispatch({ type: 'set_court_status', courtId: court.id, status: 'out_of_service' });
    expect(queuedMatches(s.state)).toHaveLength(1);
    expect(onCourt(s.state)).toHaveLength(1);
    s.dispatch({ type: 'set_court_status', courtId: court.id, status: 'available' });
    expect(queuedMatches(s.state)).toHaveLength(0);
    expect(onCourt(s.state)).toHaveLength(2);
    // sin autoStart hay que iniciarlo a mano
    const m = onCourt(s.state)[0];
    s.dispatch({ type: 'start_match', matchId: m.id });
    expect(s.state.matches.find((x) => x.id === m.id)!.status).toBe('in_progress');
  });

  it('mover un partido en curso a otra cancha libre', () => {
    const s = sim(6, 2);
    s.start();
    const m = onCourt(s.state)[0];
    const free = freeCourts(s.state)[0];
    expect(free).toBeDefined();
    s.dispatch({ type: 'move_match', matchId: m.id, courtId: free.id });
    expect(s.state.matches.find((x) => x.id === m.id)!.courtId).toBe(free.id);
  });

  it('partido manual en cola tiene prioridad cuando se libera una cancha', () => {
    const s = sim(16, 2);
    s.start();
    const busy = new Set(playersInOpenMatches(s.state));
    const waiting = s.state.players.filter((p) => !busy.has(p.id)).map((p) => p.id);
    expect(waiting.length).toBe(8);
    s.dispatch({ type: 'create_match', sides: [[waiting[0], waiting[1]], [waiting[2], waiting[3]]], courtId: null });
    const manual = s.state.matches.find((m) => m.origin === 'manual')!;
    expect(manual.status).toBe('queued');
    expect(projectUpcoming(s.state)[0].matchId).toBe(manual.id);
    const m = onCourt(s.state)[0];
    s.dispatch({ type: 'record_result', matchId: m.id, sets: [[6, 4]] });
    const after = s.state.matches.find((x) => x.id === manual.id)!;
    expect(after.status).toBe('in_progress');
    expect(after.courtId).toBe(m.courtId);
  });

  it('asignación automática apagada: no arma partidos hasta reactivar', () => {
    const s = sim(12, 2);
    s.start();
    s.dispatch({ type: 'set_auto_assign', enabled: false });
    const m = onCourt(s.state)[0];
    s.dispatch({ type: 'record_result', matchId: m.id, sets: [[6, 1]] });
    expect(freeCourts(s.state)).toHaveLength(1);
    s.dispatch({ type: 'set_auto_assign', enabled: true });
    expect(freeCourts(s.state)).toHaveLength(0);
  });

  it('ajuste de puntos (penalización) impacta el ranking', () => {
    const s = sim(8, 1);
    s.start();
    const m = onCourt(s.state)[0];
    const pid = m.sides[0].playerIds[0];
    s.dispatch({ type: 'record_result', matchId: m.id, sets: [[6, 2]] });
    s.dispatch({ type: 'adjust_points', targetId: pid, delta: -2, reason: 'Llegó tarde' });
    expect(computeStats(s.state).byId[pid].points).toBe(1);
  });
});

describe('Torneo · jugadores', () => {
  it('jugador que llega tarde entra al nivel mínimo de partidos y juega pronto', () => {
    const s = sim(12, 2);
    s.start();
    s.runMatches(8); // todos con ~1-2 partidos
    const before = computeStats(s.state);
    const min = Math.min(...before.list.map((x) => x.matchesPlayed));
    s.dispatch({ type: 'add_player', name: 'Tarde López', level: 3 });
    const late = s.state.players.find((p) => p.name === 'Tarde López')!;
    expect(late.fairnessOffset).toBeGreaterThanOrEqual(min);
    s.runMatches(12);
    const stats = computeStats(s.state);
    const counts = stats.list.filter((x) => x.id !== late.id).map((x) => x.matchesPlayed);
    // el tardío no acapara partidos: nunca supera al máximo del resto
    expect(stats.byId[late.id].matchesPlayed).toBeLessThanOrEqual(Math.max(...counts));
    expect(stats.byId[late.id].matchesPlayed).toBeGreaterThanOrEqual(1);
  });

  it('pausar un jugador: no lo programa; al volver no acumula deuda', () => {
    const s = sim(16, 2);
    s.start();
    const busy = new Set(playersInOpenMatches(s.state));
    const pid = s.state.players.find((p) => !busy.has(p.id))!.id;
    s.dispatch({ type: 'set_availability', playerId: pid, availability: 'paused' });
    s.runMatches(10);
    expect(playersInOpenMatches(s.state)).not.toContain(pid);
    expect(computeStats(s.state).byId[pid].matchesPlayed).toBe(0);
    s.dispatch({ type: 'set_availability', playerId: pid, availability: 'active' });
    const stats = computeStats(s.state);
    const min = Math.min(
      ...stats.list.filter((x) => x.id !== pid).map((x) => fairnessCount(s.state, x)),
    );
    expect(fairnessCount(s.state, stats.byId[pid])).toBe(min);
    s.runMatches(6);
    expect(computeStats(s.state).byId[pid].matchesPlayed).toBeGreaterThanOrEqual(1);
  });

  it('jugador que se va (ausente) mientras juega termina su partido y no vuelve a entrar', () => {
    const s = sim(12, 2);
    s.start();
    const m = onCourt(s.state)[0];
    const pid = m.sides[0].playerIds[0];
    s.dispatch({ type: 'set_availability', playerId: pid, availability: 'absent' });
    expect(s.state.matches.find((x) => x.id === m.id)!.status).toBe('in_progress');
    s.runMatches(10);
    const open = playersInOpenMatches(s.state);
    expect(open).not.toContain(pid);
  });

  it('estado visual del jugador', () => {
    const s = sim(12, 2);
    s.start();
    const stats = computeStats(s.state);
    const playing = s.state.players.find((p) => stats.byId[p.id].currentMatchId)!;
    expect(displayStatus(playing, stats.byId[playing.id], s.state.config, s.now, s.state.matches)).toBe('playing');
    const waiting = s.state.players.filter((p) => !stats.byId[p.id].currentMatchId).map((p) => p.id);
    expect(displayStatus(s.state.players.find((p) => p.id === waiting[0])!, stats.byId[waiting[0]], s.state.config, s.now, s.state.matches)).toBe('available');
    s.dispatch({ type: 'create_match', sides: [[waiting[0], waiting[1]], [waiting[2], waiting[3]]], courtId: null });
    const stats2 = computeStats(s.state);
    expect(displayStatus(s.state.players.find((p) => p.id === waiting[0])!, stats2.byId[waiting[0]], s.state.config, s.now, s.state.matches)).toBe('next');
    s.dispatch({ type: 'set_availability', playerId: waiting[0], availability: 'paused' });
    const stats3 = computeStats(s.state);
    expect(displayStatus(s.state.players.find((p) => p.id === waiting[0])!, stats3.byId[waiting[0]], s.state.config, s.now, s.state.matches)).toBe('paused');
    // el partido manual en el que estaba se cancela
    expect(s.state.matches.find((m) => m.origin === 'manual')!.status).toBe('cancelled');
  });

  it('parejas fijas: se agregan parejas, los puntos son de la pareja', () => {
    const s = sim(12, 2, { mode: 'fixed_pairs' });
    s.start();
    expect(s.state.teams).toHaveLength(6);
    const m = onCourt(s.state)[0];
    s.dispatch({ type: 'record_result', matchId: m.id, sets: [[6, 3]] });
    const stats = computeStats(s.state);
    expect(stats.byId[m.sides[0].teamId!].points).toBe(3);
    s.dispatch({ type: 'add_team', players: [{ name: 'Nuevo A' }, { name: 'Nuevo B' }] });
    expect(s.state.teams).toHaveLength(7);
    s.runMatches(15);
    const counts = computeStats(s.state).list.map((x) => x.matchesPlayed);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
  });
});

describe('Torneo · log de eventos', () => {
  it('replay reconstruye exactamente el estado', () => {
    const s = sim(16, 2);
    s.start();
    s.runMatches(12);
    const rebuilt = replay(s.events);
    expect(rebuilt).toEqual(s.state);
  });

  it('deshacer el último comando = reproducir sin sus eventos', () => {
    const s = sim(16, 2);
    s.start();
    s.runMatches(5);
    const before = s.state;
    const beforeLen = s.events.length;
    const m = onCourt(s.state)[0];
    s.dispatch({ type: 'record_result', matchId: m.id, sets: [[6, 0]] });
    const undone = replay(s.events.slice(0, beforeLen));
    expect(undone).toEqual(before);
  });

  it('finalizar cancela lo abierto y reabrir vuelve a asignar', () => {
    const s = sim(12, 2);
    s.start();
    s.runMatches(4);
    s.dispatch({ type: 'finish_tournament' });
    expect(s.state.status).toBe('finished');
    expect(onCourt(s.state)).toHaveLength(0);
    expect(queuedMatches(s.state)).toHaveLength(0);
    s.dispatch({ type: 'reopen_tournament' });
    expect(onCourt(s.state)).toHaveLength(2);
  });

  it('el ranking se calcula con los criterios configurados y hay avisos de equidad', () => {
    const s = sim(12, 2);
    s.start();
    s.runMatches(10);
    const stats = computeStats(s.state);
    const ranking = computeRanking(stats.list, { tiebreakers: s.state.config.tiebreakers, seed: s.state.seed });
    expect(ranking).toHaveLength(12);
    expect(ranking[0].stats.points).toBeGreaterThanOrEqual(ranking[11].stats.points);
    const warnings = computeFairnessWarnings(s.state, stats, s.now);
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('todos ya jugaron entre sí: el motor sigue armando partidos (repitiendo lo menos posible)', () => {
    const s = sim(4, 1);
    s.start();
    s.runMatches(12);
    expect(computeStats(s.state).finishedMatches).toBe(12);
    expect(onCourt(s.state)).toHaveLength(1);
  });

  it('presets válidos según el schema', async () => {
    const { tournamentConfigSchema } = await import('../tournament/config.js');
    for (const p of ['north_open', 'americano', 'mexicano', 'fixed_pairs', 'custom'] as const) {
      expect(() => tournamentConfigSchema.parse(presetConfig(p))).not.toThrow();
    }
  });
});
