/**
 * Reporte de equidad del motor.
 *
 *   pnpm simulate                       → 28 jugadores, 4 canchas, 50 partidos, todas las estrategias
 *   pnpm simulate 20 3 40 balanced      → jugadores canchas partidos estrategia
 */
import { simulate } from '../src/domain/simulation/simulator.js';
import { computeStats } from '../src/domain/tournament/stats.js';
import type { PairingStrategy } from '../src/domain/tournament/types.js';

const [, , p, c, m, strat] = process.argv;
const players = Number(p ?? 28);
const courts = Number(c ?? 4);
const matches = Number(m ?? 50);
const strategies: PairingStrategy[] = strat
  ? [strat as PairingStrategy]
  : ['balanced', 'random', 'by_level', 'top_bottom', 'max_rotation', 'custom'];

console.log(`\nNORTH PADEL · simulación ${players} jugadores · ${courts} canchas · ${matches} partidos\n`);

const rows = strategies.map((strategy) => {
  const t0 = performance.now();
  const { metrics, state, elapsedMinutes } = simulate({ players, courts, matches, strategy, seed: `cli-${strategy}`, withLevels: true });
  const ms = Math.round(performance.now() - t0);
  const stats = computeStats(state);
  const dist = stats.list.reduce<Record<number, number>>((acc, s) => {
    acc[s.matchesPlayed] = (acc[s.matchesPlayed] ?? 0) + 1;
    return acc;
  }, {});
  return {
    estrategia: strategy,
    'PJ min-max': `${metrics.minMatches}-${metrics.maxMatches}`,
    distribución: Object.entries(dist)
      .map(([k, v]) => `${v}×${k}`)
      .join(' '),
    'parejas rep.': metrics.repeatedPartnerships,
    'rivales rep.': metrics.repeatedOpponents,
    'partidos rep.': metrics.repeatedMatches,
    'comp. distintos': metrics.avgDistinctPartners.toFixed(1),
    'descanso prom.': `${metrics.avgRestMinutes.toFixed(0)} min`,
    'descanso máx.': `${metrics.maxRestMinutes.toFixed(0)} min`,
    'seguidos >máx': metrics.consecutiveViolations,
    'Δ fuerza': metrics.avgTeamStrengthGap?.toFixed(3) ?? '-',
    duración: `${Math.round(elapsedMinutes)} min`,
    cpu: `${ms} ms`,
  };
});

console.table(rows);
