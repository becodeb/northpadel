import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { verifyPassword } from '../auth/password.js';
import { createSession, destroySession, toAuthUser, type AppEnv } from '../auth/session.js';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export function authRoutes(db: Db): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get('/me', (c) => c.json({ user: c.get('user') }));

  app.post('/login', async (c) => {
    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Email o contraseña inválidos', code: 'invalid' }, 400);
    const rows = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
    const user = rows[0];
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return c.json({ error: 'Email o contraseña incorrectos', code: 'bad_credentials' }, 401);
    }
    await createSession(db, c, user.id);
    return c.json({ user: toAuthUser(user) });
  });

  app.post('/logout', async (c) => {
    await destroySession(db, c);
    return c.json({ ok: true });
  });

  return app;
}
