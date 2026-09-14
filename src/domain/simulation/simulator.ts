import { computeFairnessMetrics, type FairnessMetrics } from '../fairness/fairness-engine.js';
import { computeStrengths } from '../pairing/strength.js';
import { computeRanking } from '../ranking/ranking-engine.js';
import { createRng, type Rng } from '../shared/rng.js';
import { MINUTE } from '../shared/time.js';
import type { Command, CreateTournamentInput } from '../tournament/commands.js';
import { buildConfig, presetConfig } from '../tournament/config.js';
import { createTournamentEvent } from '../tournament/create.js';
import { decide } from '../tournament/decide.js';
import type { TournamentEvent } from '../tournament/events.js';
import { initialStateFrom, reduce } from '../tournament/reducer.js';
import { computeStats } from '../tournament/stats.js';
import type { MatchFormat, PairingStrategy, SetScore, TournamentConfig, TournamentState } from '../tournament/types.js';

/**
 * Simulador: corre un torneo completo con reloj virtual y resultados aleatorios
 * (sesgados por el nivel de cada jugador) para medir objetivamente la equidad
 * del motor. Se usa en tests y en `pnpm simulate`.
 */

export interface SimulationOptions {
  players?: number;
  courts?: number;
  matches?: number;
  strategy?: PairingStrategy;
  seed?: string;
  mode?: 'rotating' | 'fixed_pairs';
  /** Duración de cada partido en minutos [min, max]. */
  duration?: [number, number];
  /** Asignar niveles 1..5 a los jugadores (para medir equilibrio). */
  withLevels?: boolean;
  config?: Partial<TournamentConfig>;
}

export interface SimulationResult {
  state: TournamentState;
  metrics: FairnessMetrics;
  events: TournamentEvent[];
  elapsedMinutes: number;
}

const FIRST_NAMES = [
  'Juan', 'Pedro', 'Martín', 'Lucas', 'Tomás', 'Franco', 'Nico', 'Bautista', 'Santiago', 'Mateo',
  'Joaquín', 'Facundo', 'Agustín', 'Gonzalo', 'Ezequiel', 'Ramiro', 'Federico', 'Ignacio', 'Manuel', 'Julián',
  'Valentín', 'Lautaro', 'Matías', 'Sebastián', 'Emiliano', 'Rodrigo', 'Nahuel', 'Andrés', 'Diego', 'Pablo',
  'Marcos', 'Hernán', 'Leandro', 'Damián', 'Cristian', 'Gastón', 'Maxi', 'Alejo', 'Benja', 'Thiago',
];
const LAST_NAMES = [
  'Pérez', 'Gómez', 'García', 'Fernández', 'López', 'Martínez', 'Rodríguez', 'Sánchez', 'Romero', 'Díaz',
  'Álvarez', 'Torres', 'Ruiz', 'Ramírez', 'Flores', 'Acosta', 'Benítez', 'Medina', 'Herrera', 'Suárez',
  'Molina', 'Castro', 'Ortiz', 'Silva', 'Núñez', 'Luna', 'Cabrera', 'Ríos', 'Sosa', 'Vega',
];

export function demoPlayerNames(count: number, rng: Rng = createRng('names')): string[] {
  const names = new Set<string>();
  let i = 0;
  while (names.size < count) {
    const first = FIRST_NAMES[(i * 7 + rng.int(FIRST_NAMES.length)) % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 11 + rng.int(LAST_NAMES.length)) % LAST_NAMES.length];
    names.add(`${first} ${last}`);
    i++;
  }
  return Array.from(names);
}

export function buildSimulationInput(opts: SimulationOptions, rng: Rng): CreateTournamentInput {
  const n = opts.players ?? 28;
  const courts = opts.courts ?? 4;
  const mode = opts.mode ?? 'rotating';
  const base = mode === 'fixed_pairs' ? presetConfig('fixed_pairs') : presetConfig('north_open');
  const config: TournamentConfig = buildConfig({
    ...base,
    ...opts.config,
    mode,
    pairing: {
      ...base.pairing,
      ...(opts.config?.pairing ?? {}),
      strategy: opts.strategy ?? opts.config?.pairing?.strategy ?? base.pairing.strategy,
    },
  });
  const names = demoPlayerNames(n, rng);
  const players = names.map((name) => ({
    name,
    level: opts.withLevels ? 1 + rng.int(5) : null,
  }));
  const teams =
    mode === 'fixed_pairs'
      ? Array.from({ length: Math.floor(n / 2) }, (_, i) => ({ playerIndexes: [i * 2, i * 2 + 1] as [number, number] }))
      : undefined;
  return {
    config,
    players: mode === 'fixed_pairs' ? players.slice(0, Math.floor(n / 2) * 2) : players,
    teams,
    courts: Array.from({ length: courts }, (_, i) => ({ name: `Cancha ${i + 1}` })),
  };
}

/** Genera un marcador aleatorio coherente con el formato, sesgado por pWinA. */
export function randomSets(format: MatchFormat, rng: Rng, pWinA = 0.5): SetScore[] {
  const winnerA = rng.next() < pWinA;
  const set = (aWins: boolean): SetScore => {
    if (format.kind === 'points') {
      const total = format.targetPoints;
      const hi = Math.floor(total / 2) + 1 + rng.int(Math.max(1, Math.floor(total / 2) - 1));
      const lo = total - hi;
      return aWins ? [hi, lo] : [lo, hi];
    }
    const g = format.gamesPerSet;
    const r = rng.next();
    let hi = g;
    let lo = rng.int(g - 1); // 0..g-2
    if (r > 0.75) {
      hi = g + 1;
      lo = format.tiebreak && r > 0.88 ? g : g - 1;
    }
    return aWins ? [hi, lo] : [lo, hi];
  };
  if (format.kind !== 'sets' || format.bestOf === 1) {
    if (format.allowDraw && rng.next() < 0.08) {
      const g = format.kind === 'points' ? format.targetPoints / 2 : format.gamesPerSet - 1;
      return [[g, g]];
    }
    return [set(winnerA)];
  }
  const toWin = Math.ceil(format.bestOf / 2);
  const sets: SetScore[] = [];
  let a = 0;
  let b = 0;
  while (a < toWin && b < toWin) {
    const aWinsSet = rng.next() < (winnerA ? 0.7 : 0.3);
    sets.push(set(aWinsSet));
    if (aWinsSet) a++;
    else b++;
  }
  return sets;
}

export class TournamentSimulator {
  state: TournamentState;
  now: number;
  readonly rng: Rng;
  readonly events: TournamentEvent[] = [];
  private readonly endsAt = new Map<string, number>();
  private readonly duration: [number, number];
  private readonly levelOf = new Map<string, number>();

  constructor(input: CreateTournamentInput, opts: { seed?: string; now?: number; duration?: [number, number] } = {}) {
    this.rng = createRng(opts.seed ?? 'sim');
    this.now = opts.now ?? Date.UTC(2026, 8, 18, 21, 0, 0);
    this.duration = opts.duration ?? [14, 20];
    const created = createTournamentEvent(input, { now: this.now, id: 'sim', seed: opts.seed ?? 'sim' });
    this.events.push(created);
    this.state = initialStateFrom(created);
    for (const p of this.state.players) this.levelOf.set(p.id, p.level ?? 3);
  }

  dispatch(command: Command): TournamentEvent[] {
    const events = decide(this.state, command, { now: this.now });
    for (const e of events) {
      this.state = reduce(this.state, e);
      this.events.push(e);
    }
    this.trackStarts();
    return events;
  }

  private trackStarts(): void {
    for (const m of this.state.matches) {
      if (m.status === 'in_progress' && !this.endsAt.has(m.id)) {
        const [lo, hi] = this.duration;
        const minutes = lo + this.rng.next() * (hi - lo);
        this.endsAt.set(m.id, (m.startedAt ?? this.now) + minutes * MINUTE);
      }
      if (m.status === 'scheduled' && !this.endsAt.has(m.id)) {
        // sin autoStart: lo iniciamos a los 30 segundos
        this.endsAt.set(m.id, this.now + 30_000);
      }
    }
  }

  start(): void {
    this.dispatch({ type: 'start_tournament' });
  }

  advanceMinutes(minutes: number): void {
    this.now += minutes * MINUTE;
  }

  /** Próximo partido que termina (o que debe iniciarse). */
  nextEnding(): { matchId: string; at: number } | null {
    let best: { matchId: string; at: number } | null = null;
    for (const m of this.state.matches) {
      if (m.status !== 'in_progress' && m.status !== 'scheduled') continue;
      const at = this.endsAt.get(m.id);
      if (at == null) continue;
      if (!best || at < best.at) best = { matchId: m.id, at };
    }
    return best;
  }

  private strengthSide(m: { sides: { playerIds: string[] }[] }, side: 0 | 1): number {
    const ids = m.sides[side].playerIds;
    return ids.reduce((acc, id) => acc + (this.levelOf.get(id) ?? 3), 0) / Math.max(1, ids.length);
  }

  /** Avanza hasta el próximo final de partido y carga un resultado aleatorio. */
  step(): boolean {
    const next = this.nextEnding();
    if (!next) return false;
    this.now = Math.max(this.now, next.at);
    const m = this.state.matches.find((x) => x.id === next.matchId)!;
    if (m.status === 'scheduled') {
      this.endsAt.delete(m.id);
      this.dispatch({ type: 'start_match', matchId: m.id });
      return true;
    }
    const sa = this.strengthSide(m, 0);
    const sb = this.strengthSide(m, 1);
    const pWinA = 1 / (1 + Math.exp(-(sa - sb) * 0.9));
    const sets = randomSets(this.state.config.format, this.rng, pWinA);
    this.endsAt.delete(m.id);
    this.dispatch({ type: 'record_result', matchId: m.id, sets });
    return true;
  }

  runMatches(count: number): void {
    let finished = this.state.matches.filter((m) => m.status === 'finished').length;
    const target = finished + count;
    let guard = 0;
    while (finished < target && guard < count * 4) {
      if (!this.step()) break;
      finished = this.state.matches.filter((m) => m.status === 'finished').length;
      guard++;
    }
  }

  metrics(): FairnessMetrics {
    const stats = computeStats(this.state);
    const ranking = computeRanking(stats.list, { tiebreakers: this.state.config.tiebreakers, seed: this.state.seed });
    const strengths = computeStrengths(this.state, stats.byId, ranking, 'level');
    return computeFairnessMetrics(this.state, stats, this.now, strengths);
  }
}

export function simulate(opts: SimulationOptions = {}): SimulationResult {
  const seed = opts.seed ?? 'sim';
  const rng = createRng(`${seed}:input`);
  const input = buildSimulationInput(opts, rng);
  const sim = new TournamentSimulator(input, { seed, duration: opts.duration });
  sim.start();
  sim.runMatches(opts.matches ?? 50);
  return {
    state: sim.state,
    metrics: sim.metrics(),
    events: sim.events,
    elapsedMinutes: (sim.now - (sim.state.startedAt ?? sim.now)) / MINUTE,
  };
}
