import { mkdirSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { env } from '../env.js';
import * as schema from './schema.js';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let dbPromise: Promise<Db> | null = null;

/**
 * Conexión a la base:
 *  - DATABASE_URL definido → PostgreSQL real (producción).
 *  - sin DATABASE_URL → PGlite: Postgres embebido persistido en ./data/pglite.
 *    Mismo SQL, mismo Drizzle, cero infraestructura para desarrollo y demo.
 */
export function getDb(): Promise<Db> {
  if (!dbPromise) dbPromise = connect();
  return dbPromise;
}

async function connect(): Promise<Db> {
  let db: Db;
  if (env.databaseUrl) {
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const postgres = (await import('postgres')).default;
    const client = postgres(env.databaseUrl, { max: 10 });
    db = drizzle(client, { schema }) as unknown as Db;
    console.log('[db] PostgreSQL conectado');
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    mkdirSync(env.pgliteDir, { recursive: true });
    const client = new PGlite(env.pgliteDir);
    db = drizzle(client, { schema }) as unknown as Db;
    console.log(`[db] PGlite (Postgres embebido) en ${env.pgliteDir}`);
  }
  for (const statement of schema.DDL) await db.execute(sql.raw(statement));
  return db;
}
