import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMAT, DEFAULT_SCORING } from '../tournament/config.js';
import { evaluateSets, expectedSetCount, pointsForSide } from '../scoring/scoring-engine.js';
import type { MatchFormat } from '../tournament/types.js';

const games: MatchFormat = { ...DEFAULT_FORMAT, kind: 'games', gamesPerSet: 6, tiebreak: true, strict: true };
const sets3: MatchFormat = { ...DEFAULT_FORMAT, kind: 'sets', bestOf: 3, gamesPerSet: 6, tiebreak: true, strict: true };
const points: MatchFormat = { ...DEFAULT_FORMAT, kind: 'points', targetPoints: 32, allowDraw: true, strict: true };

describe('ScoringEngine · evaluación de marcadores', () => {
  it('un set a 6: 6-4 gana el lado A', () => {
    const o = evaluateSets([[6, 4]], games);
    expect(o.valid).toBe(true);
    expect(o.winner).toBe(0);
    expect(o.gamesWon).toEqual([6, 4]);
    expect(o.setsWon).toEqual([1, 0]);
  });

  it('acepta 7-5 y 7-6 con tie-break, rechaza 8-6 y 6-5', () => {
    expect(evaluateSets([[7, 5]], games).valid).toBe(true);
    expect(evaluateSets([[7, 6]], games).valid).toBe(true);
    expect(evaluateSets([[8, 6]], games).valid).toBe(false);
    expect(evaluateSets([[6, 5]], games).valid).toBe(false);
  });

  it('sin tie-break acepta sets largos 9-7', () => {
    const f = { ...games, tiebreak: false };
    expect(evaluateSets([[9, 7]], f).valid).toBe(true);
    expect(evaluateSets([[7, 6]], f).valid).toBe(false);
  });

  it('empate: solo si el formato lo permite', () => {
    expect(evaluateSets([[5, 5]], { ...games, timed: true }).valid).toBe(false);
    const o = evaluateSets([[5, 5]], { ...games, timed: true, allowDraw: true });
    expect(o.valid).toBe(true);
    expect(o.winner).toBeNull();
  });

  it('mejor de 3: exige el tercer set y rechaza sets de más', () => {
    expect(evaluateSets([[6, 4], [3, 6]], sets3).valid).toBe(false);
    const o = evaluateSets([[6, 4], [3, 6], [6, 2]], sets3);
    expect(o.valid).toBe(true);
    expect(o.winner).toBe(0);
    expect(evaluateSets([[6, 4], [6, 3], [6, 2]], sets3).valid).toBe(false);
  });

  it('super tie-break en el set decisivo', () => {
    const f = { ...sets3, superTiebreak: true };
    expect(evaluateSets([[6, 4], [3, 6], [10, 7]], f).valid).toBe(true);
    expect(evaluateSets([[6, 4], [3, 6], [10, 9]], f).valid).toBe(false);
    expect(evaluateSets([[6, 4], [3, 6], [6, 2]], f).valid).toBe(false);
  });

  it('sets en 6-6 sin definir cuentan games pero no sets (modo no estricto)', () => {
    const o = evaluateSets([[6, 6], [6, 4]], { ...sets3, strict: false });
    expect(o.valid).toBe(true);
    expect(o.setsWon).toEqual([1, 0]);
    expect(o.gamesWon).toEqual([12, 10]);
  });

  it('por puntos (americano): valida el total', () => {
    expect(evaluateSets([[20, 12]], points).winner).toBe(0);
    expect(evaluateSets([[16, 16]], points).winner).toBeNull();
    expect(evaluateSets([[20, 10]], points).valid).toBe(false);
  });

  it('modo manual acepta cualquier marcador coherente', () => {
    const loose = { ...games, strict: false };
    expect(evaluateSets([[4, 2]], loose).winner).toBe(0);
    expect(evaluateSets([[0, 0]], loose).valid).toBe(false);
    expect(evaluateSets([], loose).valid).toBe(false);
  });

  it('expectedSetCount muestra los sets necesarios', () => {
    expect(expectedSetCount(sets3, [])).toBe(2);
    expect(expectedSetCount(sets3, [[6, 4]])).toBe(2);
    expect(expectedSetCount(sets3, [[6, 4], [3, 6]])).toBe(3);
    expect(expectedSetCount(sets3, [[6, 4], [6, 3]])).toBe(2);
    expect(expectedSetCount(games, [])).toBe(1);
  });
});

describe('ScoringEngine · puntos', () => {
  it('victoria / empate / derrota', () => {
    const win = evaluateSets([[6, 4]], games);
    expect(pointsForSide(win, 0, DEFAULT_SCORING, games)).toBe(3);
    expect(pointsForSide(win, 1, DEFAULT_SCORING, games)).toBe(0);
    const draw = evaluateSets([[16, 16]], points);
    expect(pointsForSide(draw, 0, DEFAULT_SCORING, points)).toBe(1);
  });

  it('puntos por set, game y diferencia', () => {
    const rules = { ...DEFAULT_SCORING, win: 3, perSetWon: 1, perGameDiff: 0.1 };
    const o = evaluateSets([[6, 4], [3, 6], [6, 2]], sets3);
    // 3 + 2 sets + (15-12)*0.1 = 5.3
    expect(pointsForSide(o, 0, rules, sets3)).toBeCloseTo(5.3);
    // 0 + 1 set + (12-15)*0.1 = 0.7
    expect(pointsForSide(o, 1, rules, sets3)).toBeCloseTo(0.7);
  });

  it('americano: cada punto jugado suma', () => {
    const rules = { ...DEFAULT_SCORING, win: 0, draw: 0, loss: 0, perGameWon: 1 };
    const o = evaluateSets([[20, 12]], points);
    expect(pointsForSide(o, 0, rules, points)).toBe(20);
    expect(pointsForSide(o, 1, rules, points)).toBe(12);
  });

  it('bonus por ganar en sets corridos', () => {
    const rules = { ...DEFAULT_SCORING, straightSetsBonus: 1 };
    const straight = evaluateSets([[6, 4], [6, 3]], sets3);
    const three = evaluateSets([[6, 4], [3, 6], [6, 1]], sets3);
    expect(pointsForSide(straight, 0, rules, sets3)).toBe(4);
    expect(pointsForSide(three, 0, rules, sets3)).toBe(3);
  });
});
