import { createHmac, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Db } from '../db/client.js';
import { sessions, users, type UserRow } from '../db/schema.js';
import { env } from '../env.js';

const COOKIE = 'np_session';
const SESSION_DAYS = 30;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export type AppEnv = {
  Variables: {
    user: AuthUser | null;
  };
};

function sign(value: string): string {
  return createHmac('sha256', env.sessionSecret).update(value).digest('base64url');
}

function encode(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`;
}

function decode(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf('.');
  if (dot < 0) return null;
  const id = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  return sign(id) === sig ? id : null;
}

export function toAuthUser(row: UserRow): AuthUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export async function createSession(db: Db, c: Context, userId: string): Promise<void> {
  const id = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id, userId, expiresAt });
  setCookie(c, COOKIE, encode(id), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.isProduction,
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function destroySession(db: Db, c: Context): Promise<void> {
  const id = decode(getCookie(c, COOKIE));
  if (id) await db.delete(sessions).where(eq(sessions.id, id));
  deleteCookie(c, COOKIE, { path: '/' });
}

export async function resolveUser(db: Db, c: Context): Promise<AuthUser | null> {
  const id = decode(getCookie(c, COOKIE));
  if (!id) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ? toAuthUser(rows[0].user) : null;
}

/** Carga el usuario (si hay sesión) sin exigirlo. */
export function attachUser(db: Db): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('user', await resolveUser(db, c));
    await next();
  };
}

/** Exige sesión de organizador. Todas las mutaciones pasan por acá. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'No autorizado', code: 'unauthorized' }, 401);
  await next();
};
