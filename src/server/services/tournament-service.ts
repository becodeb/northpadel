import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, isNull, max } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  createTournamentEvent,
  createTournamentSchema,
  decide,
  DomainError,
  initialStateFrom,
  reduce,
  replay,
  type Command,
  type CreateTournamentInput,
  type StoredEvent,
  type TournamentEvent,
  type TournamentState,
} from '../../domain/index.js';
import type { AuthUser } from '../auth/session.js';
import type { Db } from '../db/client.js';
import { toStoredEvent, tournamentEvents, tournaments, type TournamentRow } from '../db/schema.js';
import type { RealtimeHub } from '../realtime/hub.js';

export interface TournamentSummary {
  id: string;
  name: string;
  status: TournamentState['status'];
  mode: TournamentState['config']['mode'];
  preset: TournamentState['config']['preset'];
  playersCount: number;
  courtsCount: number;
  finishedMatches: number;
  createdAt: number;
  updatedAt: number;
  scheduledAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface TournamentSnapshot {
  revision: number;
  state: TournamentState;
}

/**
 * Servicio de aplicación del torneo. Serializa las mutaciones por torneo
 * (mutex en memoria) para que dos organizadores no pisen el mismo estado.
 */
export class TournamentService {
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly db: Db,
    private readonly hub: RealtimeHub,
  ) {}

  private async withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    this.locks.set(id, run.catch(() => undefined));
    try {
      return await run;
    } finally {
      if (this.locks.get(id) === run) this.locks.delete(id);
    }
  }

  private summarize(row: TournamentRow): TournamentSummary {
    const state = row.state;
    return {
      id: row.id,
      name: state.config.name,
      status: state.status,
      mode: state.config.mode,
      preset: state.config.preset,
      playersCount: state.players.length,
      courtsCount: state.courts.length,
      finishedMatches: state.matches.filter((m) => m.status === 'finished').length,
      createdAt: state.createdAt,
      updatedAt: row.updatedAt.getTime(),
      scheduledAt: state.config.scheduledAt,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
    };
  }

  async list(): Promise<TournamentSummary[]> {
    const rows = await this.db
      .select()
      .from(tournaments)
      .where(isNull(tournaments.deletedAt))
      .orderBy(desc(tournaments.updatedAt));
    return rows.map((r) => this.summarize(r));
  }

  async get(id: string): Promise<TournamentSnapshot | null> {
    const rows = await this.db
      .select()
      .from(tournaments)
      .where(and(eq(tournaments.id, id), isNull(tournaments.deletedAt)))
      .limit(1);
    const row = rows[0];
    return row ? { revision: row.revision, state: row.state } : null;
  }

  async events(id: string): Promise<StoredEvent[]> {
    const rows = await this.db
      .select()
      .from(tournamentEvents)
      .where(eq(tournamentEvents.tournamentId, id))
      .orderBy(asc(tournamentEvents.seq));
    return rows.map(toStoredEvent);
  }

  async create(rawInput: unknown, actor: AuthUser | null): Promise<TournamentSnapshot> {
    const input: CreateTournamentInput = createTournamentSchema.parse(rawInput);
    const now = Date.now();
    const id = nanoid(10);
    const seed = randomBytes(8).toString('hex');
    const created = createTournamentEvent(input, { now, id, seed });
    const state = initialStateFrom(created);
    await this.db.insert(tournaments).values({
      id,
      name: state.config.name,
      status: state.status,
      mode: state.config.mode,
      revision: 1,
      state,
      playersCount: state.players.length,
      createdBy: actor?.id ?? null,
      scheduledAt: state.config.scheduledAt ? new Date(state.config.scheduledAt) : null,
    });
    await this.db.insert(tournamentEvents).values({
      tournamentId: id,
      seq: 1,
      batchId: nanoid(8),
      commandType: 'create_tournament',
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      at: now,
      event: created,
    });
    this.hub.broadcastListChanged();
    return { revision: 1, state };
  }

  async dispatch(id: string, command: Command, actor: AuthUser | null): Promise<TournamentSnapshot & { events: TournamentEvent[] }> {
    return this.withLock(id, async () => {
      const current = await this.get(id);
      if (!current) throw new DomainError('not_found', 'El torneo no existe.');
      const now = Date.now();
      const events = decide(current.state, command, { now });
      if (events.length === 0) return { ...current, events: [] };

      const state = events.reduce(reduce, current.state);
      const [{ seq: lastSeq }] = await this.db
        .select({ seq: max(tournamentEvents.seq) })
        .from(tournamentEvents)
        .where(eq(tournamentEvents.tournamentId, id));
      let seq = lastSeq ?? 0;
      const batchId = nanoid(8);
      await this.db.insert(tournamentEvents).values(
        events.map((event) => ({
          tournamentId: id,
          seq: ++seq,
          batchId,
          commandType: command.type,
          actorId: actor?.id ?? null,
          actorName: actor?.name ?? null,
          at: now,
          event,
        })),
      );
      const revision = await this.persistState(id, state, current.revision + 1);
      this.hub.broadcastState(id, revision, state);
      if (state.status !== current.state.status || command.type === 'update_config') this.hub.broadcastListChanged();
      return { revision, state, events };
    });
  }

  /** Deshace el último comando (lote de eventos) no deshecho. */
  async undo(id: string): Promise<TournamentSnapshot & { undoneCommand: string | null }> {
    return this.withLock(id, async () => {
      const current = await this.get(id);
      if (!current) throw new DomainError('not_found', 'El torneo no existe.');
      const rows = await this.db
        .select()
        .from(tournamentEvents)
        .where(eq(tournamentEvents.tournamentId, id))
        .orderBy(asc(tournamentEvents.seq));
      const live = rows.filter((r) => !r.undone);
      const last = live[live.length - 1];
      if (!last || last.seq === 1 || last.commandType === 'create_tournament') {
        throw new DomainError('nothing_to_undo', 'No hay nada para deshacer.');
      }
      await this.db
        .update(tournamentEvents)
        .set({ undone: true })
        .where(and(eq(tournamentEvents.tournamentId, id), eq(tournamentEvents.batchId, last.batchId)));
      const remaining = live.filter((r) => r.batchId !== last.batchId).map((r) => r.event);
      const state = replay(remaining);
      const revision = await this.persistState(id, state, current.revision + 1);
      this.hub.broadcastState(id, revision, state);
      this.hub.broadcastListChanged();
      return { revision, state, undoneCommand: last.commandType };
    });
  }

  private async persistState(id: string, state: TournamentState, revision: number): Promise<number> {
    await this.db
      .update(tournaments)
      .set({
        name: state.config.name,
        status: state.status,
        mode: state.config.mode,
        revision,
        state,
        playersCount: state.players.length,
        updatedAt: new Date(),
        scheduledAt: state.config.scheduledAt ? new Date(state.config.scheduledAt) : null,
        startedAt: state.startedAt ? new Date(state.startedAt) : null,
        finishedAt: state.finishedAt ? new Date(state.finishedAt) : null,
      })
      .where(eq(tournaments.id, id));
    return revision;
  }

  async remove(id: string): Promise<void> {
    await this.db.update(tournaments).set({ deletedAt: new Date() }).where(eq(tournaments.id, id));
    this.hub.broadcastListChanged();
  }
}
