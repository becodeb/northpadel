import { combinations, lineupSignature, pairKey, pairSplits } from '../shared/combinatorics.js';
import { stableLottery } from '../shared/rng.js';
import { CONSECUTIVE_GAP_MS } from '../tournament/stats.js';
import type { PairingRules, PairingStrategy } from '../tournament/types.js';
import { STRENGTH_RANGE } from './strength.js';

/**
 * PairingEngine
 *
 * Dado un conjunto de competidores disponibles, propone el mejor partido posible
 * evaluando TODAS las alineaciones candidatas con una función de costo.
 *
 *   cost = Σ peso_k · término_k
 *
 * Términos (todos ≥ 0, menor es mejor):
 *   balance     partidos "de más" respecto del que menos jugó (Σ por jugador)
 *   consecutive exceso de partidos seguidos respecto del máximo permitido
 *   rest        déficit de descanso (0 = el que más esperó, 1 = el que menos)
 *   partner     veces que las parejas propuestas ya jugaron juntas
 *   opponent    veces que los cruces propuestos ya se enfrentaron
 *   sameMatch   1 si este partido exacto ya se jugó
 *   strength    diferencia de fuerza entre los dos lados (0..1)
 *   levelSpread dispersión de fuerza entre los 4 (0..1) — "por nivel" la minimiza
 *   mix         1 − dispersión dentro de cada pareja (0..1) — "mejor + peor" la minimiza
 *   avoid       1 si la alineación está en la lista a evitar (rehacer partido)
 *   jitter      ruido determinista (semilla) para variedad
 *
 * Cada estrategia es simplemente un juego de pesos. "Personalizado" usa los
 * porcentajes del organizador. El balance de partidos jugados es dominante en
 * todas las estrategias predefinidas: la diferencia de PJ nunca supera 1 salvo
 * imposibilidad matemática.
 */

export interface CompetitorView {
  id: string;
  /** Jugadores que componen el competidor (1 en rotativo, 2 en parejas fijas). */
  memberIds: string[];
  /** Partidos jugados + compensación (ver Player.fairnessOffset). */
  fairnessCount: number;
  restMs: number;
  /** Racha de partidos seguidos ya jugada. */
  consecutive: number;
  partners: Record<string, number>;
  opponents: Record<string, number>;
  /** Fuerza estimada 1..5. */
  strength: number;
  /** Nombre para armar la explicación. */
  name: string;
}

export interface PairingRequest {
  candidates: CompetitorView[];
  /** 2 = parejas rotativas (4 jugadores), 1 = parejas fijas (2 equipos). */
  sideSize: 1 | 2;
  rules: PairingRules;
  /**
   * Clave de ruido determinista. El "azar" es una función pura de (clave, alineación):
   * mismo estado ⇒ misma propuesta, así la proyección de próximos coincide con lo
   * que el motor arma cuando se libera la cancha.
   */
  jitterKey: string;
  /** Firmas de alineaciones a evitar (ej. el partido que se está rehaciendo). */
  avoidSignatures?: string[];
  /**
   * Alineación anunciada (lo que mostraba "Próximos"). Se respeta si sigue siendo
   * válida y su costo no supera al óptimo por más de `preferredTolerance`
   * (una diferencia de partidos jugados siempre pesa más que la tolerancia).
   */
  preferred?: [string[], string[]] | null;
  preferredTolerance?: number;
}

export interface CostWeights {
  balance: number;
  consecutive: number;
  rest: number;
  partner: number;
  opponent: number;
  sameMatch: number;
  strength: number;
  levelSpread: number;
  mix: number;
  avoid: number;
  jitter: number;
}

export interface LineupProposal {
  /** Ids de competidores por lado. */
  sides: [string[], string[]];
  cost: number;
  breakdown: Record<keyof CostWeights, number>;
  reason: string;
}

/** Cuántos competidores entran en la evaluación combinatoria. */
const POOL_SIZE = 12;

const BASE: Omit<CostWeights, 'strength' | 'levelSpread' | 'mix' | 'partner' | 'opponent' | 'jitter'> = {
  balance: 10,
  consecutive: 5,
  rest: 0.5,
  sameMatch: 1,
  avoid: 20,
};

export function strategyWeights(rules: PairingRules): CostWeights {
  const s: PairingStrategy = rules.strategy;
  switch (s) {
    case 'random':
      return { ...BASE, partner: 0.6, opponent: 0.25, strength: 0, levelSpread: 0, mix: 0, jitter: 1 };
    case 'balanced':
      return { ...BASE, partner: 0.8, opponent: 0.45, strength: 1.5, levelSpread: 0, mix: 0, jitter: 0.05 };
    case 'by_level':
      return { ...BASE, rest: 0.4, partner: 0.6, opponent: 0.25, strength: 0.6, levelSpread: 1.5, mix: 0, jitter: 0.05 };
    case 'top_bottom':
      return { ...BASE, rest: 0.4, partner: 0.6, opponent: 0.25, strength: 0.8, levelSpread: 0, mix: 1.5, jitter: 0.05 };
    case 'max_rotation':
      return { ...BASE, partner: 2, opponent: 0.8, sameMatch: 1.5, strength: 0.15, levelSpread: 0, mix: 0, jitter: 0.05 };
    case 'custom': {
      const w = rules.weights;
      return {
        ...BASE,
        balance: (w.matchBalance / 100) * 10,
        partner: (w.partnerRepeat / 100) * 2.5,
        opponent: (w.opponentRepeat / 100) * 1,
        rest: (w.rest / 100) * 1,
        strength: (w.level / 100) * 2,
        levelSpread: 0,
        mix: 0,
        jitter: 0.05,
      };
    }
  }
}

interface Candidate {
  sides: [CompetitorView[], CompetitorView[]];
}

function enumerateCandidates(pool: CompetitorView[], sideSize: 1 | 2): Candidate[] {
  const out: Candidate[] = [];
  if (sideSize === 1) {
    for (const [a, b] of combinations(pool, 2)) out.push({ sides: [[a], [b]] });
  } else {
    for (const four of combinations(pool, 4)) {
      for (const [x, y] of pairSplits(four)) out.push({ sides: [x, y] });
    }
  }
  return out;
}

function partnerCount(a: CompetitorView, b: CompetitorView): number {
  return a.partners[b.id] ?? 0;
}

function opponentCount(a: CompetitorView, b: CompetitorView): number {
  return a.opponents[b.id] ?? 0;
}

function sum(side: CompetitorView[], f: (c: CompetitorView) => number): number {
  return side.reduce((acc, c) => acc + f(c), 0);
}

interface Scored {
  cost: number;
  breakdown: Record<keyof CostWeights, number>;
}

interface ScoreContext {
  sideSize: 1 | 2;
  rules: PairingRules;
  weights: CostWeights;
  minCount: number;
  maxRest: number;
  avoid: Set<string>;
  jitterKey: string;
}

function scoreCandidate(cand: Candidate, ctx: ScoreContext): Scored {
  const { sideSize, rules, weights, minCount, maxRest, avoid, jitterKey } = ctx;
  const all = [...cand.sides[0], ...cand.sides[1]];

  const balance = sum(all, (c) => c.fairnessCount - minCount);
  const consecutive = sum(all, (c) => {
    const prospective = c.restMs <= CONSECUTIVE_GAP_MS ? c.consecutive + 1 : 1;
    return Math.max(0, prospective - rules.maxConsecutive);
  });
  const rest = sum(all, (c) => 1 - c.restMs / maxRest);

  let partner = 0;
  let mix = 0;
  if (sideSize === 2) {
    for (const side of cand.sides) {
      partner += partnerCount(side[0], side[1]);
      mix += 1 - Math.abs(side[0].strength - side[1].strength) / STRENGTH_RANGE;
    }
    mix /= 2;
  }

  let opponent = 0;
  for (const a of cand.sides[0]) for (const b of cand.sides[1]) opponent += opponentCount(a, b);

  // Partido exacto repetido: todos los cruces ya ocurrieron y las parejas también
  const crossPairs = cand.sides[0].length * cand.sides[1].length;
  const sameMatch =
    opponent >= crossPairs && (sideSize === 1 || partner >= 2) && allCrossPlayed(cand) ? 1 : 0;

  const s0 = sum(cand.sides[0], (c) => c.strength) / cand.sides[0].length;
  const s1 = sum(cand.sides[1], (c) => c.strength) / cand.sides[1].length;
  const strength = Math.abs(s0 - s1) / STRENGTH_RANGE;

  const strengths = all.map((c) => c.strength);
  const levelSpread = (Math.max(...strengths) - Math.min(...strengths)) / STRENGTH_RANGE;

  const signature = lineupSignature(cand.sides.map((s) => s.map((c) => c.id)));
  const avoidTerm = avoid.has(signature) ? 1 : 0;
  const jitter = stableLottery(jitterKey, signature);

  const breakdown: Record<keyof CostWeights, number> = {
    balance,
    consecutive,
    rest,
    partner,
    opponent,
    sameMatch,
    strength,
    levelSpread,
    mix,
    avoid: avoidTerm,
    jitter,
  };
  let cost = 0;
  for (const k of Object.keys(weights) as (keyof CostWeights)[]) cost += weights[k] * breakdown[k];
  return { cost, breakdown };
}

export function proposeLineup(req: PairingRequest): LineupProposal | null {
  const { candidates, sideSize, rules, jitterKey } = req;
  const needed = sideSize * 2;
  if (candidates.length < needed) return null;

  const weights = strategyWeights(rules);
  // En parejas fijas no hay término "compañero": la variedad se mide solo por rivales.
  if (sideSize === 1) weights.opponent = Math.max(weights.opponent, weights.partner);
  const avoid = new Set(req.avoidSignatures ?? []);

  // Orden de prioridad: menos partidos → más descanso → menos seguidos → azar
  const jitterOf = new Map<string, number>();
  for (const c of candidates) jitterOf.set(c.id, stableLottery(jitterKey, c.id));
  const sorted = candidates.slice().sort(
    (a, b) =>
      a.fairnessCount - b.fairnessCount ||
      b.restMs - a.restMs ||
      a.consecutive - b.consecutive ||
      (jitterOf.get(a.id) ?? 0) - (jitterOf.get(b.id) ?? 0),
  );
  const pool = sorted.slice(0, Math.max(needed, POOL_SIZE));
  const minCount = Math.min(...candidates.map((c) => c.fairnessCount));
  const maxRest = Math.max(1, ...pool.map((c) => c.restMs));
  const ctx: ScoreContext = { sideSize, rules, weights, minCount, maxRest, avoid, jitterKey };

  let best: LineupProposal | null = null;
  for (const cand of enumerateCandidates(pool, sideSize)) {
    const { cost, breakdown } = scoreCandidate(cand, ctx);
    if (!best || cost < best.cost) {
      best = {
        sides: [cand.sides[0].map((c) => c.id), cand.sides[1].map((c) => c.id)],
        cost,
        breakdown,
        reason: explain(cand, breakdown, minCount, rules),
      };
    }
  }
  if (!best) return null;

  // ¿Respetar lo anunciado en "Próximos"?
  if (req.preferred) {
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const sides = req.preferred.map((side) => side.map((id) => byId.get(id)));
    if (sides.every((side) => side.length === sideSize && side.every(Boolean))) {
      const cand: Candidate = { sides: [sides[0] as CompetitorView[], sides[1] as CompetitorView[]] };
      const { cost, breakdown } = scoreCandidate(cand, ctx);
      const tolerance = req.preferredTolerance ?? 1;
      if (cost <= best.cost + tolerance) {
        return {
          sides: [req.preferred[0].slice(), req.preferred[1].slice()],
          cost,
          breakdown,
          reason: explain(cand, breakdown, minCount, rules),
        };
      }
    }
  }

  return best;
}

function allCrossPlayed(cand: Candidate): boolean {
  for (const a of cand.sides[0]) for (const b of cand.sides[1]) if (!(a.opponents[b.id] ?? 0)) return false;
  return true;
}

/** Explicación corta y honesta de por qué se eligió esta alineación. */
function explain(
  cand: Candidate,
  b: Record<keyof CostWeights, number>,
  minCount: number,
  rules: PairingRules,
): string {
  const parts: string[] = [];
  const all = [...cand.sides[0], ...cand.sides[1]];
  const counts = all.map((c) => c.fairnessCount);
  const allSame = counts.every((c) => c === counts[0]);
  if (allSame) parts.push(counts[0] === 0 ? 'Primer partido' : `Todos con ${counts[0]} PJ`);
  else if (b.balance > 0) parts.push(`Prioridad a los de ${minCount} PJ`);
  else parts.push('Menos partidos jugados');

  if (cand.sides[0].length === 2) {
    if (b.partner === 0) parts.push('Compañeros nuevos');
    else parts.push(`${b.partner} pareja repetida`);
  }
  if (b.opponent === 0) parts.push('Rivales nuevos');

  if (rules.strategy === 'balanced' || rules.strategy === 'custom') {
    if (b.strength < 0.1) parts.push('Fuerza pareja');
  } else if (rules.strategy === 'by_level') {
    parts.push('Nivel similar');
  } else if (rules.strategy === 'top_bottom') {
    parts.push('Mezcla de niveles');
  } else if (rules.strategy === 'random') {
    parts.push('Sorteo');
  }
  return parts.slice(0, 3).join(' · ');
}

/** Firma canónica para comparar alineaciones (ids de competidores). */
export function signatureOf(sides: [string[], string[]]): string {
  return lineupSignature(sides);
}

export { pairKey };
