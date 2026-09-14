import { Hono } from 'hono';
import { z } from 'zod';
import { buildActivity, commandSchema, DomainError } from '../../domain/index.js';
import { requireAdmin, type AppEnv } from '../auth/session.js';
import type { TournamentService } from '../services/tournament-service.js';

function domainErrorResponse(err: unknown) {
  if (err instanceof DomainError) {
    return { status: 409 as const, body: { error: err.message, code: err.code } };
  }
  if (err instanceof z.ZodError) {
    const first = err.issues[0];
    return {
      status: 400 as const,
      body: { error: first ? `${first.path.join('.')}: ${first.message}` : 'Datos inválidos', code: 'validation' },
    };
  }
  return null;
}

export function tournamentRoutes(service: TournamentService): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    const mapped = domainErrorResponse(err);
    if (mapped) return c.json(mapped.body, mapped.status);
    console.error('[api]', err);
    return c.json({ error: 'Error interno', code: 'internal' }, 500);
  });

  // ── Público (solo lectura) ─────────────────────────────────────────────
  app.get('/public/:id', async (c) => {
    const snapshot = await service.get(c.req.param('id'));
    if (!snapshot) return c.json({ error: 'No existe', code: 'not_found' }, 404);
    return c.json(snapshot);
  });

  // ── Organizador ────────────────────────────────────────────────────────
  app.use('/*', requireAdmin);

  app.get('/', async (c) => c.json({ tournaments: await service.list() }));

  app.post('/', async (c) => {
    const body = await c.req.json();
    const snapshot = await service.create(body, c.get('user'));
    return c.json(snapshot, 201);
  });

  app.get('/:id', async (c) => {
    const snapshot = await service.get(c.req.param('id'));
    if (!snapshot) return c.json({ error: 'No existe', code: 'not_found' }, 404);
    return c.json(snapshot);
  });

  app.get('/:id/events', async (c) => {
    const snapshot = await service.get(c.req.param('id'));
    if (!snapshot) return c.json({ error: 'No existe', code: 'not_found' }, 404);
    const events = await service.events(c.req.param('id'));
    return c.json({ events, activity: buildActivity(snapshot.state, events) });
  });

  app.post('/:id/commands', async (c) => {
    const command = commandSchema.parse(await c.req.json());
    const result = await service.dispatch(c.req.param('id'), command, c.get('user'));
    return c.json({ revision: result.revision, state: result.state, applied: result.events.length });
  });

  app.post('/:id/undo', async (c) => {
    const result = await service.undo(c.req.param('id'));
    return c.json(result);
  });

  app.delete('/:id', async (c) => {
    await service.remove(c.req.param('id'));
    return c.json({ ok: true });
  });

  return app;
}
