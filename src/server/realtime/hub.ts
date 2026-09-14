import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { TournamentState } from '../../domain/index.js';

/**
 * Hub de realtime: cada cliente se suscribe a uno o más torneos y recibe el
 * estado completo con su revisión en cada cambio. Es público (solo lectura);
 * las mutaciones siempre pasan por la API autenticada.
 */

type ServerMessage =
  | { type: 'hello'; serverTime: number }
  | { type: 'state'; tournamentId: string; revision: number; state: TournamentState }
  | { type: 'tournaments_changed' }
  | { type: 'pong' };

type ClientMessage =
  | { type: 'subscribe'; tournamentId: string }
  | { type: 'unsubscribe'; tournamentId: string }
  | { type: 'ping' };

interface Client {
  socket: WebSocket;
  subscriptions: Set<string>;
  alive: boolean;
}

export class RealtimeHub {
  private readonly clients = new Set<Client>();
  private wss: WebSocketServer | null = null;
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(private readonly loadState: (id: string) => Promise<{ revision: number; state: TournamentState } | null>) {}

  attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (socket, _req: IncomingMessage) => this.onConnection(socket));
    this.heartbeat = setInterval(() => {
      for (const client of this.clients) {
        if (!client.alive) {
          client.socket.terminate();
          this.clients.delete(client);
          continue;
        }
        client.alive = false;
        client.socket.ping();
      }
    }, 30_000);
  }

  private onConnection(socket: WebSocket): void {
    const client: Client = { socket, subscriptions: new Set(), alive: true };
    this.clients.add(client);
    this.send(client, { type: 'hello', serverTime: Date.now() });

    socket.on('pong', () => {
      client.alive = true;
    });
    socket.on('message', async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }
      if (msg.type === 'ping') {
        this.send(client, { type: 'pong' });
      } else if (msg.type === 'subscribe' && typeof msg.tournamentId === 'string') {
        client.subscriptions.add(msg.tournamentId);
        const current = await this.loadState(msg.tournamentId);
        if (current) {
          this.send(client, { type: 'state', tournamentId: msg.tournamentId, ...current });
        }
      } else if (msg.type === 'unsubscribe' && typeof msg.tournamentId === 'string') {
        client.subscriptions.delete(msg.tournamentId);
      }
    });
    socket.on('close', () => this.clients.delete(client));
    socket.on('error', () => this.clients.delete(client));
  }

  private send(client: Client, message: ServerMessage): void {
    if (client.socket.readyState === client.socket.OPEN) {
      client.socket.send(JSON.stringify(message));
    }
  }

  broadcastState(tournamentId: string, revision: number, state: TournamentState): void {
    for (const client of this.clients) {
      if (client.subscriptions.has(tournamentId)) {
        this.send(client, { type: 'state', tournamentId, revision, state });
      }
    }
  }

  broadcastListChanged(): void {
    for (const client of this.clients) this.send(client, { type: 'tournaments_changed' });
  }

  close(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.wss?.close();
  }
}
