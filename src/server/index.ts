import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { getDb } from './db/client.js';
import { env } from './env.js';
import { RealtimeHub } from './realtime/hub.js';
import { seedAdmin, seedDemo } from './seed.js';
import { TournamentService } from './services/tournament-service.js';

async function main(): Promise<void> {
  const db = await getDb();
  let service: TournamentService;
  const hub = new RealtimeHub((id) => service.get(id));
  service = new TournamentService(db, hub);

  await seedAdmin(db);
  await seedDemo(db, service);

  const app = createApp(db, service);
  const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
    console.log(`[north-padel] API en http://localhost:${info.port}  (ws: /ws)`);
  }) as Server;
  hub.attach(server);

  const shutdown = () => {
    hub.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[north-padel] error fatal', err);
  process.exit(1);
});
