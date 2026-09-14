/**
 * Genera los íconos PWA (PNG) a partir del isotipo SVG con resvg.
 *   pnpm icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const OUT = path.resolve(process.cwd(), 'public', 'icons');
mkdirSync(OUT, { recursive: true });

function markSvg(size: number, padding: number, rounded = true): string {
  const inner = size - padding * 2;
  const scale = inner / 32;
  const radius = rounded ? 9 * scale : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rounded ? size * 0.22 : 0}" fill="#191919"/>
  <g transform="translate(${padding} ${padding}) scale(${scale})">
    <rect width="32" height="32" rx="${radius / scale}" fill="#191919"/>
    <path d="M9 23V9l4.2 0L23 20.2V9" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M9 23V9" stroke="#22B8B5" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M23 9v14" stroke="#E74383" stroke-width="3.2" stroke-linecap="round"/>
  </g>
</svg>`;
}

function render(svg: string, file: string): void {
  const png = new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng();
  writeFileSync(path.join(OUT, file), png);
  console.log('✓', file, `${(png.length / 1024).toFixed(1)} KB`);
}

writeFileSync(path.join(OUT, 'icon.svg'), markSvg(64, 4));
render(markSvg(192, 12), 'icon-192.png');
render(markSvg(512, 32), 'icon-512.png');
render(markSvg(512, 96, false), 'icon-512-maskable.png');
render(markSvg(180, 10), 'apple-touch-icon.png');
