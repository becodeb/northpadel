/**
 * Utilidades deterministas: hash de strings, generador pseudoaleatorio con semilla
 * e IDs reproducibles. Todo el motor usa esto para que un mismo comando aplicado
 * sobre el mismo estado produzca exactamente los mismos eventos (cliente optimista
 * y servidor coinciden, y el log de eventos se puede reproducir).
 */

/** cyrb53: hash rápido y estable de 53 bits. */
export function hashString(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export interface Rng {
  /** Número en [0, 1). */
  next(): number;
  /** Entero en [0, max). */
  int(max: number): number;
  /** Elemento aleatorio de un array. */
  pick<T>(items: readonly T[]): T;
  /** Copia mezclada (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
}

/** mulberry32: PRNG pequeño, rápido y suficientemente bueno para scheduling. */
export function createRng(seed: string | number): Rng {
  let a = typeof seed === 'number' ? seed >>> 0 : hashString(seed) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max) => Math.floor(next() * max),
    pick: (items) => items[Math.floor(next() * items.length)],
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** ID corto determinista derivado del rng (usado dentro del motor). */
export function deterministicId(rng: Rng, prefix: string, length = 8): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[rng.int(ALPHABET.length)];
  return `${prefix}_${out}`;
}

/** Valor estable en [0,1) para desempates "por sorteo" reproducibles. */
export function stableLottery(seed: string, id: string): number {
  return (hashString(`${seed}:${id}`) % 1_000_003) / 1_000_003;
}
