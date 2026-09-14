import type { TournamentState } from '@domain';

/**
 * Cliente WebSocket con reconexión automática. Público (solo lectura).
 * Un único socket por pestaña; cada pantalla se suscribe a los torneos que muestra.
 */

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

type StateListener = (revision: number, state: TournamentState) => void;

class RealtimeClient {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = 'connecting';
  private readonly statusListeners = new Set<(s: ConnectionStatus) => void>();
  private readonly stateListeners = new Map<string, Set<StateListener>>();
  private readonly listListeners = new Set<() => void>();
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.connect();
    window.addEventListener('online', () => this.reconnectNow());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.status !== 'online') this.reconnectNow();
    });
  }

  private url(): string {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  private connect(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.setStatus('connecting');
    try {
      this.socket = new WebSocket(this.url());
    } catch {
      this.scheduleReconnect();
      return;
    }
    const socket = this.socket;
    socket.onopen = () => {
      this.retry = 0;
      this.setStatus('online');
      for (const id of this.stateListeners.keys()) {
        socket.send(JSON.stringify({ type: 'subscribe', tournamentId: id }));
      }
    };
    socket.onmessage = (ev) => {
      let msg: { type: string; tournamentId?: string; revision?: number; state?: TournamentState };
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (msg.type === 'state' && msg.tournamentId && msg.state && typeof msg.revision === 'number') {
        for (const l of this.stateListeners.get(msg.tournamentId) ?? []) l(msg.revision, msg.state);
      } else if (msg.type === 'tournaments_changed') {
        for (const l of this.listListeners) l();
      }
    };
    socket.onclose = () => {
      this.socket = null;
      this.setStatus('offline');
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      socket.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.timer) return;
    const delay = Math.min(10_000, 800 * 2 ** this.retry++);
    this.timer = setTimeout(() => this.connect(), delay);
  }

  reconnectNow(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
    this.retry = 0;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.connect();
  }

  private setStatus(s: ConnectionStatus): void {
    if (this.status === s) return;
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  onStatus(listener: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onListChanged(listener: () => void): () => void {
    this.listListeners.add(listener);
    return () => this.listListeners.delete(listener);
  }

  subscribe(tournamentId: string, listener: StateListener): () => void {
    let set = this.stateListeners.get(tournamentId);
    const isNew = !set;
    if (!set) {
      set = new Set();
      this.stateListeners.set(tournamentId, set);
    }
    set.add(listener);
    if (isNew && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'subscribe', tournamentId }));
    }
    return () => {
      set!.delete(listener);
      if (set!.size === 0) {
        this.stateListeners.delete(tournamentId);
        if (this.socket?.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ type: 'unsubscribe', tournamentId }));
        }
      }
    };
  }
}

export const realtime = new RealtimeClient();
