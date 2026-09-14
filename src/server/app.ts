import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { attachUser, type AppEnv } from './auth/session.js';
import type { Db } from './db/client.js';
import { env } from './env.js';
import { authRoutes } from './routes/auth.js';
import { tournamentRoutes } from './routes/tournaments.js';
import type { TournamentService } from './services/tournament-service.js';

export function createApp(db: Db, service: TournamentService): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  if (!env.isProduction) app.use(logger());
  app.use('*', attachUser(db));

  app.get('/api/health', (c) => c.json({ ok: true, time: Date.now() }));
  app.route('/api/auth', authRoutes(db));
  app.route('/api/tournaments', tournamentRoutes(service));
  app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'No existe', code: 'not_found' }, 404) : c.text('Not found', 404)));

  // Producción: servir el cliente compilado (SPA con fallback a index.html).
  if (existsSync(env.clientDist)) {
    const indexHtml = readFileSync(path.join(env.clientDist, 'index.html'), 'utf8');
    app.use('/*', serveStatic({ root: path.relative(process.cwd(), env.clientDist) }));
    app.get('/*', (c) => c.html(indexHtml));
  }

  return app;
}
