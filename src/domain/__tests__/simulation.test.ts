import { describe, expect, it } from 'vitest';
import { simulate } from '../simulation/simulator.js';

/**
 * Tests de equidad: corren torneos completos y verifican métricas objetivas.
 * 28 jugadores · 4 canchas · 50 partidos = 200 lugares → 7.14 partidos por jugador.
 */

const STRATEGIES = ['balanced', 'random', 'by_level', 'top_bottom', 'max_rotation', 'custom'] as const;

describe('Simulación · 28 jugadores, 4 canchas, 50 partidos', () => {
  for (const strategy of STRATEGIES) {
    it(`${strategy}: reparto de partidos con diferencia máxima 1`, () => {
      const { metrics } = simulate({ players: 28, courts: 4, matches: 50, strategy, seed: `s-${strategy}`, withLevels: true });
      expect(metrics.finishedMatches).toBe(50);
      expect(metrics.matchSpread).toBeLessThanOrEqual(1);
      expect(metrics.minMatches).toBeGreaterThanOrEqual(7);
    });
  }

  it('balanced: casi nadie repite compañero y pocos rivales repetidos', () => {
    const { metrics } = simulate({ players: 28, courts: 4, matches: 50, strategy: 'balanced', seed: 'fair', withLevels: true });
    // Cada jugador tiene ~7 compañeros de 27 posibles: casi no debería haber repeticiones.
    expect(metrics.repeatedPartnerships).toBeLessThanOrEqual(3);
    // ~14 rivales de 27 posibles: alguna repetición es inevitable (random da ~30).
    expect(metrics.repeatedOpponents).toBeLessThanOrEqual(25);
    expect(metrics.repeatedMatches).toBe(0);
    expect(metrics.avgDistinctPartners).toBeGreaterThanOrEqual(6.5);
    const random = simulate({ players: 28, courts: 4, matches: 50, strategy: 'random', seed: 'fair', withLevels: true });
    expect(metrics.repeatedOpponents).toBeLessThan(random.metrics.repeatedOpponents);
  });

  it('max_rotation: (casi) ninguna pareja repetida en 5 semillas distintas', () => {
    for (const seed of ['rot', 'r1', 'r2', 'r3', 'r4']) {
      const { metrics } = simulate({ players: 28, courts: 4, matches: 50, strategy: 'max_rotation', seed });
      expect(metrics.repeatedPartnerships, seed).toBeLessThanOrEqual(5);
      expect(metrics.repeatedMatches, seed).toBe(0);
      expect(metrics.avgDistinctPartners, seed).toBeGreaterThanOrEqual(6.8);
    }
  });

  it('balanced: los lados quedan más parejos que con random', () => {
    const balanced = simulate({ players: 28, courts: 4, matches: 60, strategy: 'balanced', seed: 'lv', withLevels: true });
    const random = simulate({ players: 28, courts: 4, matches: 60, strategy: 'random', seed: 'lv', withLevels: true });
    expect(balanced.metrics.avgTeamStrengthGap!).toBeLessThan(random.metrics.avgTeamStrengthGap!);
  });

  it('nadie juega más de 2 partidos seguidos ni espera de más', () => {
    const { metrics } = simulate({ players: 28, courts: 4, matches: 50, strategy: 'balanced', seed: 'rest' });
    expect(metrics.consecutiveViolations).toBe(0);
    // Con 28 jugadores y 4 canchas, cada uno juega ~4 de cada 7 turnos: espera ~1 partido (15-20 min).
    expect(metrics.avgRestMinutes).toBeLessThan(45);
    expect(metrics.maxRestMinutes).toBeLessThan(75);
  });

  it('mantiene la equidad en tamaños incómodos (5, 7, 9, 11, 13, 18 jugadores)', () => {
    // Cuando casi todos juegan a la vez (13 jugadores / 3 canchas), la duración
    // variable de los partidos puede dejar transitoriamente a alguien 2 abajo:
    // nadie disponible tenía menos partidos en el momento de armar. Con margen
    // de espera (28/4) la diferencia se mantiene en 1.
    for (const [players, courts] of [
      [5, 1],
      [7, 2],
      [9, 2],
      [11, 2],
      [13, 3],
      [18, 4],
    ] as const) {
      for (const seed of ['a', 'b']) {
        const { metrics } = simulate({ players, courts, matches: 30, strategy: 'balanced', seed: `n${players}${seed}` });
        expect(metrics.finishedMatches, `${players}p`).toBe(30);
        expect(metrics.matchSpread, `${players} jugadores / ${courts} canchas`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('parejas fijas: 8 parejas, 2 canchas, 24 partidos', () => {
    const { metrics } = simulate({ players: 16, courts: 2, matches: 24, mode: 'fixed_pairs', seed: 'fp' });
    expect(metrics.finishedMatches).toBe(24);
    expect(metrics.matchSpread).toBeLessThanOrEqual(1);
    // 8 parejas, 6 partidos cada una, 7 rivales posibles → casi sin repetir
    expect(metrics.repeatedOpponents).toBeLessThanOrEqual(2);
  });

  it('el mismo seed produce exactamente el mismo torneo', () => {
    const a = simulate({ players: 20, courts: 3, matches: 20, seed: 'det' });
    const b = simulate({ players: 20, courts: 3, matches: 20, seed: 'det' });
    expect(a.state).toEqual(b.state);
  });
});
