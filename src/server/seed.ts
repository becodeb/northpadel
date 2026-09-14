import { eq, isNull, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { buildDemoInput } from '../domain/index.js';
import { hashPassword } from './auth/password.js';
import type { Db } from './db/client.js';
import { tournaments, users } from './db/schema.js';
import { env } from './env.js';
import type { TournamentService } from './services/tournament-service.js';

/** Usuario organizador inicial (idempotente). */
export async function seedAdmin(db: Db): Promise<void> {
  const existing = await db.select().from(users).where(eq(users.email, env.adminEmail)).limit(1);
  if (existing.length) return;
  await db.insert(users).values({
    id: nanoid(10),
    email: env.adminEmail,
    name: env.adminName,
    passwordHash: hashPassword(env.adminPassword),
    role: 'admin',
  });
  console.log(`[seed] organizador creado: ${env.adminEmail}`);
}

/** Demo "Cancha Abierta — North Padel": 28 jugadores, 4 canchas, lista para comenzar. */
export async function seedDemo(db: Db, service: TournamentService): Promise<void> {
  const existing = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(and(eq(tournaments.name, 'Cancha Abierta — Demo'), isNull(tournaments.deletedAt)))
    .limit(1);
  if (existing.length) return;
  const input = buildDemoInput();
  const admin = await db.select().from(users).where(eq(users.email, env.adminEmail)).limit(1);
  await service.create(input, admin[0] ? { id: admin[0].id, email: admin[0].email, name: admin[0].name, role: admin[0].role } : null);
  console.log('[seed] torneo demo creado');
}
