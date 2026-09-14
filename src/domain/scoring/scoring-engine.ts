import type { MatchFormat, ScoringRules, SetScore } from '../tournament/types.js';

/**
 * ScoringEngine: convierte un marcador (lista de sets) en un resultado
 * (ganador / empate, sets y games) y calcula los puntos que suma cada lado
 * según las reglas configuradas del torneo.
 *
 * Es 100% puro y no conoce jugadores: solo lados 0 y 1.
 */

export interface MatchOutcome {
  valid: boolean;
  error: string | null;
  /** 0 | 1 = lado ganador, null = empate. Solo tiene sentido si valid. */
  winner: 0 | 1 | null;
  setsWon: [number, number];
  gamesWon: [number, number];
  /** Ganó sin ceder ningún set. */
  straightSets: boolean;
}

const SUPER_TIEBREAK_TARGET = 10;

function isNonNegativeInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

function invalid(error: string): MatchOutcome {
  return {
    valid: false,
    error,
    winner: null,
    setsWon: [0, 0],
    gamesWon: [0, 0],
    straightSets: false,
  };
}

/** ¿Un set es válido según reglas estrictas? */
function isValidStrictSet(
  set: SetScore,
  format: MatchFormat,
  opts: { deciding: boolean },
): string | null {
  const [a, b] = set;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const diff = hi - lo;

  if (format.kind === 'points') {
    if (a + b !== format.targetPoints) {
      return `El partido es a ${format.targetPoints} puntos en total (cargaste ${a + b}).`;
    }
    return null;
  }

  if (format.timed) return null; // por tiempo: vale como quedó

  if (opts.deciding && format.superTiebreak && format.kind === 'sets' && format.bestOf > 1) {
    if (hi < SUPER_TIEBREAK_TARGET || diff < 2) {
      return `El super tie-break se juega a ${SUPER_TIEBREAK_TARGET} con diferencia de 2.`;
    }
    return null;
  }

  const g = format.gamesPerSet;
  if (hi < g) return `Un set se gana con ${g} games.`;
  if (hi === g && diff >= 2) return null;
  if (hi === g + 1 && lo === g - 1) return null; // 7-5
  if (format.tiebreak && hi === g + 1 && lo === g) return null; // 7-6
  if (!format.tiebreak && hi > g && diff === 2) return null; // set largo 9-7
  if (format.tiebreak) {
    return `Marcador inválido para un set a ${g} con tie-break (ej. ${g}-4, ${g + 1}-5, ${g + 1}-${g}).`;
  }
  return `Marcador inválido: el set se gana por 2 games de diferencia.`;
}

export function evaluateSets(sets: SetScore[] | null | undefined, format: MatchFormat): MatchOutcome {
  if (!sets || sets.length === 0) return invalid('Cargá el resultado.');
  for (const s of sets) {
    if (!Array.isArray(s) || s.length !== 2 || !isNonNegativeInt(s[0]) || !isNonNegativeInt(s[1])) {
      return invalid('Marcador inválido.');
    }
  }
  if (sets.every(([a, b]) => a === 0 && b === 0)) return invalid('Cargá el resultado.');

  if (format.kind !== 'sets' && sets.length > 1) {
    return invalid('Este formato tiene un único marcador.');
  }

  const setsWon: [number, number] = [0, 0];
  const gamesWon: [number, number] = [0, 0];
  for (const [a, b] of sets) {
    gamesWon[0] += a;
    gamesWon[1] += b;
    if (a > b) setsWon[0]++;
    else if (b > a) setsWon[1]++;
  }

  const setsToWin = format.kind === 'sets' ? Math.ceil(format.bestOf / 2) : 1;

  if (format.strict) {
    if (format.kind === 'sets') {
      if (sets.length > format.bestOf) return invalid(`Máximo ${format.bestOf} sets.`);
      for (let i = 0; i < sets.length; i++) {
        // set posterior a la definición del partido
        const winsBefore = countWinsBefore(sets, i);
        if (winsBefore[0] >= setsToWin || winsBefore[1] >= setsToWin) {
          return invalid('Hay sets cargados después de que el partido ya estaba definido.');
        }
        const deciding = i === format.bestOf - 1;
        const err = isValidStrictSet(sets[i], format, { deciding });
        if (err) return invalid(`Set ${i + 1}: ${err}`);
      }
      const decided = setsWon[0] >= setsToWin || setsWon[1] >= setsToWin;
      if (!decided && !format.timed && !(format.allowDraw && setsWon[0] === setsWon[1])) {
        return invalid('El partido no está definido: falta cargar un set.');
      }
    } else {
      const err = isValidStrictSet(sets[0], format, { deciding: true });
      if (err) return invalid(err);
    }
  }

  let winner: 0 | 1 | null = null;
  if (setsWon[0] !== setsWon[1]) {
    winner = setsWon[0] > setsWon[1] ? 0 : 1;
  } else if (gamesWon[0] !== gamesWon[1]) {
    winner = gamesWon[0] > gamesWon[1] ? 0 : 1;
  }

  if (winner === null && !format.allowDraw) {
    return invalid('Empate no permitido en este torneo: cargá un ganador.');
  }

  const straightSets = winner !== null && setsWon[winner === 0 ? 1 : 0] === 0 && sets.length > 1;

  return { valid: true, error: null, winner, setsWon, gamesWon, straightSets };
}

function countWinsBefore(sets: SetScore[], index: number): [number, number] {
  const w: [number, number] = [0, 0];
  for (let i = 0; i < index; i++) {
    const [a, b] = sets[i];
    if (a > b) w[0]++;
    else if (b > a) w[1]++;
  }
  return w;
}

/** Puntos que suma un lado por el resultado, según las reglas. */
export function pointsForSide(
  outcome: MatchOutcome,
  side: 0 | 1,
  rules: ScoringRules,
  format: MatchFormat,
): number {
  if (!outcome.valid) return 0;
  const other: 0 | 1 = side === 0 ? 1 : 0;
  let pts = 0;
  if (outcome.winner === side) pts += rules.win;
  else if (outcome.winner === null) pts += rules.draw;
  else pts += rules.loss;

  pts += rules.perSetWon * outcome.setsWon[side];
  pts += rules.perSetLost * outcome.setsWon[other];
  pts += rules.perGameWon * outcome.gamesWon[side];
  pts += rules.perGameLost * outcome.gamesWon[other];
  pts += rules.perGameDiff * (outcome.gamesWon[side] - outcome.gamesWon[other]);

  if (
    outcome.winner === side &&
    outcome.straightSets &&
    format.kind === 'sets' &&
    format.bestOf > 1
  ) {
    pts += rules.straightSetsBonus;
  }
  return Math.round(pts * 100) / 100;
}

/** "6-4 3-6 10-7" */
export function formatScore(sets: SetScore[] | null | undefined, perspective: 0 | 1 = 0): string {
  if (!sets || sets.length === 0) return '—';
  return sets
    .map(([a, b]) => (perspective === 0 ? `${a}-${b}` : `${b}-${a}`))
    .join('  ');
}

/** Cantidad de sets que corresponde mostrar en la carga según el formato y lo cargado. */
export function expectedSetCount(format: MatchFormat, current: SetScore[]): number {
  if (format.kind !== 'sets') return 1;
  const setsToWin = Math.ceil(format.bestOf / 2);
  let a = 0;
  let b = 0;
  for (const [x, y] of current) {
    if (x > y) a++;
    else if (y > x) b++;
  }
  if (a >= setsToWin || b >= setsToWin) return Math.max(1, current.length);
  return Math.min(format.bestOf, Math.max(setsToWin, current.length + 1));
}

/** Etiqueta corta del formato para mostrar en pantalla. */
export function describeFormat(format: MatchFormat): string {
  if (format.kind === 'points') return `A ${format.targetPoints} puntos`;
  const set =
    format.kind === 'sets' && format.bestOf > 1
      ? `Mejor de ${format.bestOf} sets a ${format.gamesPerSet}`
      : `1 set a ${format.gamesPerSet}`;
  const extras: string[] = [];
  if (format.tiebreak && !format.timed) extras.push('tie-break');
  if (format.superTiebreak && format.kind === 'sets' && format.bestOf > 1) extras.push('super TB');
  if (format.timed) extras.push(format.timeMinutes ? `${format.timeMinutes} min` : 'por tiempo');
  return extras.length ? `${set} · ${extras.join(' · ')}` : set;
}
