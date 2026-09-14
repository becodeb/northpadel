import { describe, expect, it } from 'vitest';
import { proposeLineup, type CompetitorView } from '../pairing/pairing-engine.js';
import { DEFAULT_PAIRING } from '../tournament/config.js';
import type { PairingRules } from '../tournament/types.js';

function view(id: string, patch: Partial<CompetitorView> = {}): CompetitorView {
  return {
    id,
    memberIds: [id],
    name: id,
    fairnessCount: 0,
    restMs: 10 * 60_000,
    consecutive: 0,
    partners: {},
    opponents: {},
    strength: 3,
    ...patch,
  };
}

function rules(patch: Partial<PairingRules> = {}): PairingRules {
  return { ...DEFAULT_PAIRING, ...patch };
}

function ids(p: ReturnType<typeof proposeLineup>): string[] {
  return [...p!.sides[0], ...p!.sides[1]].sort();
}

describe('PairingEngine', () => {
  it('devuelve null con menos de 4 jugadores', () => {
    const p = proposeLineup({ candidates: [view('a'), view('b'), view('c')], sideSize: 2, rules: rules(), jitterKey: String(1) });
    expect(p).toBeNull();
  });

  it('prioriza siempre a los que menos partidos jugaron', () => {
    const candidates = [
      view('a', { fairnessCount: 2 }),
      view('b', { fairnessCount: 2 }),
      view('c', { fairnessCount: 1 }),
      view('d', { fairnessCount: 1 }),
      view('e', { fairnessCount: 1 }),
      view('f', { fairnessCount: 1 }),
      view('g', { fairnessCount: 3 }),
    ];
    for (const strategy of ['random', 'balanced', 'by_level', 'top_bottom', 'max_rotation'] as const) {
      const p = proposeLineup({ candidates, sideSize: 2, rules: rules({ strategy }), jitterKey: String(strategy) });
      expect(ids(p)).toEqual(['c', 'd', 'e', 'f']);
    }
  });

  it('con un solo jugador atrasado, lo incluye y completa con el resto', () => {
    const candidates = [
      view('late', { fairnessCount: 1 }),
      view('a', { fairnessCount: 2 }),
      view('b', { fairnessCount: 2 }),
      view('c', { fairnessCount: 2 }),
      view('d', { fairnessCount: 2 }),
    ];
    const p = proposeLineup({ candidates, sideSize: 2, rules: rules(), jitterKey: String(1) });
    expect(ids(p)).toContain('late');
  });

  it('evita repetir compañero cuando hay alternativa', () => {
    const candidates = [
      view('a', { partners: { b: 1 } }),
      view('b', { partners: { a: 1 } }),
      view('c', { partners: { d: 1 } }),
      view('d', { partners: { c: 1 } }),
    ];
    const p = proposeLineup({ candidates, sideSize: 2, rules: rules(), jitterKey: String(1) })!;
    for (const side of p.sides) {
      expect(side.sort().join()).not.toBe('a,b');
      expect(side.sort().join()).not.toBe('c,d');
    }
    expect(p.breakdown.partner).toBe(0);
  });

  it('prefiere a los que más descansaron ante igualdad de partidos', () => {
    const candidates = [
      view('fresh1', { restMs: 0 }),
      view('fresh2', { restMs: 0 }),
      view('w1', { restMs: 20 * 60_000 }),
      view('w2', { restMs: 18 * 60_000 }),
      view('w3', { restMs: 15 * 60_000 }),
      view('w4', { restMs: 12 * 60_000 }),
    ];
    const p = proposeLineup({ candidates, sideSize: 2, rules: rules(), jitterKey: String(2) });
    expect(ids(p)).toEqual(['w1', 'w2', 'w3', 'w4']);
  });

  it('EQUILIBRADO: minimiza la diferencia de fuerza entre lados (#1+#4 vs #2+#3)', () => {
    const candidates = [
      view('p1', { strength: 5 }),
      view('p2', { strength: 4 }),
      view('p3', { strength: 2 }),
      view('p4', { strength: 1 }),
    ];
    const p = proposeLineup({ candidates, sideSize: 2, rules: rules({ strategy: 'balanced' }), jitterKey: String(1) })!;
    const sideOf = (id: string) => p.sides.findIndex((s) => s.includes(id));
    expect(sideOf('p1')).toBe(sideOf('p4'));
    expect(sideOf('p2')).toBe(sideOf('p3'));
    expect(p.breakdown.strength).toBe(0);
  });

  it('MEJOR + PEOR: mezcla alto y bajo en la misma pareja', () => {
    const candidates = [
      view('p1', { strength: 5 }),
      view('p2', { strength: 4.5 }),
      view('p3', { strength: 1.5 }),
      view('p4', { strength: 1 }),
    ];
    const p = proposeLineup({ candidates, sideSize: 2, rules: rules({ strategy: 'top_bottom' }), jitterKey: String(1) })!;
    for (const side of p.sides) {
      const strengths = side.map((id) => candidates.find((c) => c.id === id)!.strength);
      expect(Math.abs(strengths[0] - strengths[1])).toBeGreaterThanOrEqual(3);
    }
  });

  it('POR NIVEL: elige jugadores de fuerza similar entre los disponibles', () => {
    const candidates = [
      view('top1', { strength: 5 }),
      view('top2', { strength: 4.8 }),
      view('top3', { strength: 4.6 }),
      view('top4', { strength: 4.4 }),
      view('low1', { strength: 1.2 }),
      view('low2', { strength: 1 }),
    ];
    const p = proposeLineup({ candidates, sideSize: 2, rules: rules({ strategy: 'by_level' }), jitterKey: String(1) });
    expect(ids(p)).toEqual(['top1', 'top2', 'top3', 'top4']);
  });

  it('ROTACIÓN MÁXIMA: penaliza más las parejas repetidas que el equilibrio', () => {
    const candidates = [
      view('a', { strength: 5, partners: { d: 1 } }),
      view('b', { strength: 5, partners: { c: 1 } }),
      view('c', { strength: 1, partners: { b: 1 } }),
      view('d', { strength: 1, partners: { a: 1 } }),
    ];
    // Equilibrado preferiría a+c / b+d o a+d / b+c (fuerza pareja) — a+d y b+c ya jugaron.
    const p = proposeLineup({ candidates, sideSize: 2, rules: rules({ strategy: 'max_rotation' }), jitterKey: String(1) })!;
    expect(p.breakdown.partner).toBe(0);
  });

  it('penaliza rachas por encima de maxConsecutive', () => {
    const candidates = [
      view('tired', { consecutive: 2, restMs: 0 }),
      view('a'),
      view('b'),
      view('c'),
      view('d'),
    ];
    const p = proposeLineup({ candidates, sideSize: 2, rules: rules({ maxConsecutive: 2 }), jitterKey: String(1) });
    expect(ids(p)).not.toContain('tired');
  });

  it('evita alineaciones marcadas (rehacer partido)', () => {
    const candidates = [view('a'), view('b'), view('c'), view('d')];
    const first = proposeLineup({ candidates, sideSize: 2, rules: rules(), jitterKey: String(1) })!;
    const sig = [...first.sides].map((s) => s.slice().sort().join('+')).sort().join(' vs ');
    const second = proposeLineup({ candidates, sideSize: 2, rules: rules(), jitterKey: String(1), avoidSignatures: [sig] })!;
    const sig2 = [...second.sides].map((s) => s.slice().sort().join('+')).sort().join(' vs ');
    expect(sig2).not.toBe(sig);
  });

  it('parejas fijas: elige dos equipos evitando rivales repetidos', () => {
    const candidates = [
      view('t1', { memberIds: ['x', 'y'], opponents: { t2: 1 } }),
      view('t2', { memberIds: ['x', 'y'], opponents: { t1: 1 } }),
      view('t3', { memberIds: ['x', 'y'] }),
      view('t4', { memberIds: ['x', 'y'], fairnessCount: 1 }),
    ];
    const p = proposeLineup({ candidates, sideSize: 1, rules: rules(), jitterKey: String(1) })!;
    expect(p.sides[0].length).toBe(1);
    expect(ids(p)).not.toContain('t4');
    expect(ids(p).join()).not.toBe('t1,t2');
  });

  it('es determinista con la misma semilla', () => {
    const candidates = Array.from({ length: 12 }, (_, i) => view(`p${i}`, { strength: 1 + (i % 5) }));
    const a = proposeLineup({ candidates, sideSize: 2, rules: rules({ strategy: 'random' }), jitterKey: String('s') })!;
    const b = proposeLineup({ candidates, sideSize: 2, rules: rules({ strategy: 'random' }), jitterKey: String('s') })!;
    expect(a.sides).toEqual(b.sides);
  });
});
