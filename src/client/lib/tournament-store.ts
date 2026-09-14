import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { decide, DomainError, reduce, type Command, type TournamentState } from '@domain';
import { api, ApiError } from './api';
import { realtime, type ConnectionStatus } from './ws';

/**
 * Sesión de un torneo en el cliente.
 *
 *  - `serverState` es lo confirmado por el servidor (con su revisión).
 *  - Los comandos se aplican de forma OPTIMISTA con el mismo motor que usa el
 *    servidor (decide/reduce) y quedan pendientes hasta que el servidor responde.
 *  - Sin conexión, los comandos quedan en cola (persistida en localStorage) y se
 *    reintentan al volver. El estado nunca se pierde.
 */

export interface SyncInfo {
  connection: ConnectionStatus;
  pending: number;
  syncing: boolean;
  lastError: string | null;
}

export interface SessionSnapshot {
  state: TournamentState | null;
  revision: number;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  sync: SyncInfo;
}

interface PendingCommand {
  id: string;
  command: Command;
  createdAt: number;
}

type Listener = () => void;

const STORAGE_PREFIX = 'np:pending:';

export class TournamentSession {
  private serverState: TournamentState | null = null;
  private revision = 0;
  private pending: PendingCommand[] = [];
  private status: SessionSnapshot['status'] = 'loading';
  private error: string | null = null;
  private syncing = false;
  private lastError: string | null = null;
  private connection: ConnectionStatus = realtime.getStatus();
  private snapshot: SessionSnapshot;
  private readonly listeners = new Set<Listener>();
  private unsubscribeWs: (() => void) | null = null;
  private unsubscribeStatus: (() => void) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;

  constructor(
    readonly id: string,
    private readonly publicOnly: boolean,
  ) {
    this.pending = this.loadPending();
    this.snapshot = this.buildSnapshot();
  }

  // ─── ciclo de vida ─────────────────────────────────────────────────────

  attach(): void {
    if (this.unsubscribeWs) return;
    realtime.start();
    this.unsubscribeWs = realtime.subscribe(this.id, (revision, state) => this.onServerState(revision, state));
    this.unsubscribeStatus = realtime.onStatus((s) => {
      this.connection = s;
      if (s === 'online') {
        void this.reload();
        void this.flush();
      }
      this.emit();
    });
    void this.reload();
    void this.flush();
  }

  detach(): void {
    this.unsubscribeWs?.();
    this.unsubscribeStatus?.();
    this.unsubscribeWs = null;
    this.unsubscribeStatus = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SessionSnapshot => this.snapshot;

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const l of this.listeners) l();
  }

  private buildSnapshot(): SessionSnapshot {
    return {
      state: this.displayedState(),
      revision: this.revision,
      status: this.status,
      error: this.error,
      sync: {
        connection: this.connection,
        pending: this.pending.length,
        syncing: this.syncing,
        lastError: this.lastError,
      },
    };
  }

  // ─── estado ────────────────────────────────────────────────────────────

  private displayedState(): TournamentState | null {
    if (!this.serverState) return null;
    let state = this.serverState;
    for (const p of this.pending) {
      try {
        const events = decide(state, p.command, { now: p.createdAt });
        state = events.reduce(reduce, state);
      } catch {
        // si ya no aplica sobre el estado nuevo, el servidor lo va a rechazar
      }
    }
    return state;
  }

  private onServerState(revision: number, state: TournamentState): void {
    if (revision < this.revision) return;
    this.serverState = state;
    this.revision = revision;
    this.status = 'ready';
    this.error = null;
    this.emit();
  }

  async reload(): Promise<void> {
    try {
      const snap = this.publicOnly ? await api.tournaments.getPublic(this.id) : await api.tournaments.get(this.id);
      this.onServerState(snap.revision, snap.state);
    } catch (err) {
      if (!this.serverState) {
        this.status = 'error';
        this.error = err instanceof ApiError ? err.message : 'No se pudo cargar el torneo';
        this.emit();
      }
    }
  }

  // ─── comandos ──────────────────────────────────────────────────────────

  /** Valida y aplica optimistamente; lanza DomainError si el comando no es válido. */
  dispatch(command: Command): void {
    const current = this.displayedState();
    if (!current) throw new DomainError('not_loaded', 'El torneo todavía no cargó.');
    // Validación local inmediata (misma lógica que el servidor).
    decide(current, command, { now: Date.now() });
    this.pending.push({ id: Math.random().toString(36).slice(2), command, createdAt: Date.now() });
    this.savePending();
    this.lastError = null;
    this.emit();
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.publicOnly) return;
    this.flushing = true;
    this.syncing = this.pending.length > 0;
    this.emit();
    try {
      while (this.pending.length) {
        const item = this.pending[0];
        try {
          const res = await api.tournaments.command(this.id, item.command);
          this.pending.shift();
          this.savePending();
          this.onServerState(res.revision, res.state);
        } catch (err) {
          if (err instanceof ApiError && err.isNetwork) {
            this.scheduleRetry();
            return;
          }
          if (err instanceof ApiError && err.status === 401) {
            this.lastError = 'Tu sesión expiró. Volvé a ingresar.';
            this.scheduleRetry(15_000);
            return;
          }
          // Rechazado por el servidor: descartamos y avisamos.
          this.pending.shift();
          this.savePending();
          this.lastError = err instanceof Error ? err.message : 'Cambio rechazado';
          this.onRejected?.(this.lastError, item.command);
          await this.reload();
        }
      }
    } finally {
      this.flushing = false;
      this.syncing = false;
      this.emit();
    }
  }

  onRejected: ((message: string, command: Command) => void) | null = null;

  private scheduleRetry(delay = 3000): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }

  async undo(): Promise<string | null> {
    const res = await api.tournaments.undo(this.id);
    this.onServerState(res.revision, res.state);
    return res.undoneCommand;
  }

  // ─── persistencia local de pendientes ─────────────────────────────────

  private loadPending(): PendingCommand[] {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + this.id);
      return raw ? (JSON.parse(raw) as PendingCommand[]) : [];
    } catch {
      return [];
    }
  }

  private savePending(): void {
    try {
      if (this.pending.length) localStorage.setItem(STORAGE_PREFIX + this.id, JSON.stringify(this.pending));
      else localStorage.removeItem(STORAGE_PREFIX + this.id);
    } catch {
      /* sin storage */
    }
  }
}

const sessions = new Map<string, TournamentSession>();

export function getSession(id: string, publicOnly: boolean): TournamentSession {
  const key = `${publicOnly ? 'pub' : 'adm'}:${id}`;
  let s = sessions.get(key);
  if (!s) {
    s = new TournamentSession(id, publicOnly);
    sessions.set(key, s);
  }
  return s;
}

export function useTournamentSession(id: string, options: { publicOnly?: boolean } = {}) {
  const session = getSession(id, options.publicOnly ?? false);
  useEffect(() => {
    session.attach();
    return () => session.detach();
  }, [session]);
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const dispatch = useCallback((command: Command) => session.dispatch(command), [session]);
  const undo = useCallback(() => session.undo(), [session]);
  const reload = useCallback(() => session.reload(), [session]);
  return { ...snap, dispatch, undo, reload, session };
}
