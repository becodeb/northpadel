import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Carga .env (sin dependencias) y expone la configuración del servidor. */
function loadDotEnv(): void {
  try {
    const file = readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
    for (const raw of file.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* sin .env: usamos defaults */
  }
}

loadDotEnv();

export const env = {
  port: Number(process.env.PORT ?? 3000),
  isProduction: process.env.NODE_ENV === 'production',
  databaseUrl: process.env.DATABASE_URL?.trim() || null,
  pgliteDir: process.env.PGLITE_DIR ?? path.resolve(process.cwd(), 'data', 'pglite'),
  sessionSecret: process.env.SESSION_SECRET ?? 'north-padel-dev-secret-change-me',
  adminEmail: (process.env.ADMIN_EMAIL ?? 'admin@northpadel.com').toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD ?? 'northpadel',
  adminName: process.env.ADMIN_NAME ?? 'Organizador',
  publicUrl: process.env.PUBLIC_URL?.replace(/\/$/, '') || null,
  clientDist: path.resolve(process.cwd(), 'dist', 'client'),
};
