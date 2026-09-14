import type { ActivityEntry, Command, CreateTournamentInput, StoredEvent, TournamentState } from '@domain';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      ...init,
    });
  } catch {
    throw new ApiError(0, 'network', 'Sin conexión');
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.code ?? 'error', body?.error ?? `Error ${res.status}`);
  }
  return body as T;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

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

export interface Snapshot {
  revision: number;
  state: TournamentState;
}

export const api = {
  auth: {
    me: () => request<{ user: AuthUser | null }>('/api/auth/me'),
    login: (email: string, password: string) =>
      request<{ user: AuthUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  },
  tournaments: {
    list: () => request<{ tournaments: TournamentSummary[] }>('/api/tournaments'),
    get: (id: string) => request<Snapshot>(`/api/tournaments/${id}`),
    getPublic: (id: string) => request<Snapshot>(`/api/tournaments/public/${id}`),
    create: (input: CreateTournamentInput) =>
      request<Snapshot>('/api/tournaments', { method: 'POST', body: JSON.stringify(input) }),
    command: (id: string, command: Command) =>
      request<Snapshot & { applied: number }>(`/api/tournaments/${id}/commands`, {
        method: 'POST',
        body: JSON.stringify(command),
      }),
    undo: (id: string) => request<Snapshot & { undoneCommand: string | null }>(`/api/tournaments/${id}/undo`, { method: 'POST' }),
    events: (id: string) => request<{ events: StoredEvent[]; activity: ActivityEntry[] }>(`/api/tournaments/${id}/events`),
    remove: (id: string) => request<{ ok: true }>(`/api/tournaments/${id}`, { method: 'DELETE' }),
  },
};
