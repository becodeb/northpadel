/** Todas las combinaciones de tamaño k de un array (orden estable). */
export function combinations<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const n = items.length;
  if (k > n || k <= 0) return out;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    out.push(idx.map((i) => items[i]));
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}

/**
 * Las 3 formas de dividir 4 jugadores en 2 parejas.
 * [a,b,c,d] → ab/cd, ac/bd, ad/bc
 */
export function pairSplits<T>(four: readonly T[]): [T[], T[]][] {
  const [a, b, c, d] = four;
  return [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
}

/** Clave canónica (orden-independiente) para un par de ids. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Firma canónica de una alineación (dos lados, orden-independiente). */
export function lineupSignature(sides: readonly (readonly string[])[]): string {
  return sides
    .map((s) => s.slice().sort().join('+'))
    .sort()
    .join(' vs ');
}
