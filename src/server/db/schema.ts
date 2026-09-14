import { bigint, bigserial, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { StoredEvent, TournamentEvent, TournamentState } from '../../domain/index.js';

/**
 * Persistencia. El torneo es un agregado: guardamos el log de eventos (fuente
 * de verdad, auditable, deshacible) y una proyección `state` lista para servir.
 */

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tournaments = pgTable(
  'tournaments',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    status: text('status').notNull(),
    mode: text('mode').notNull(),
    /** Revisión monotónica para realtime (sube con cada cambio, incluido deshacer). */
    revision: integer('revision').notNull().default(0),
    state: jsonb('state').$type<TournamentState>().notNull(),
    playersCount: integer('players_count').notNull().default(0),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('tournaments_updated_idx').on(t.updatedAt)],
);

export const tournamentEvents = pgTable(
  'tournament_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    batchId: text('batch_id').notNull(),
    commandType: text('command_type').notNull(),
    actorId: text('actor_id'),
    actorName: text('actor_name'),
    at: bigint('at', { mode: 'number' }).notNull(),
    undone: boolean('undone').notNull().default(false),
    event: jsonb('event').$type<TournamentEvent>().notNull(),
  },
  (t) => [uniqueIndex('tournament_events_seq_idx').on(t.tournamentId, t.seq)],
);

export type UserRow = typeof users.$inferSelect;
export type TournamentRow = typeof tournaments.$inferSelect;
export type EventRow = typeof tournamentEvents.$inferSelect;

export function toStoredEvent(row: EventRow): StoredEvent {
  return {
    seq: row.seq,
    batchId: row.batchId,
    commandType: row.commandType,
    actorId: row.actorId,
    actorName: row.actorName,
    at: row.at,
    undone: row.undone,
    event: row.event,
  };
}

/** DDL idempotente: se ejecuta sentencia por sentencia al arrancar. */
export const DDL: string[] = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tournaments (
  id text PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL,
  mode text NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  state jsonb NOT NULL,
  players_count integer NOT NULL DEFAULT 0,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS tournaments_updated_idx ON tournaments(updated_at);
CREATE TABLE IF NOT EXISTS tournament_events (
  id bigserial PRIMARY KEY,
  tournament_id text NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  batch_id text NOT NULL,
  command_type text NOT NULL,
  actor_id text,
  actor_name text,
  at bigint NOT NULL,
  undone boolean NOT NULL DEFAULT false,
  event jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_events_seq_idx ON tournament_events(tournament_id, seq);
`
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);
