import { createContext, useContext } from 'react';
import type { Command, TournamentState } from '@domain';
import type { Derived } from '@/lib/derived';
import type { SyncInfo } from '@/lib/tournament-store';

export interface EventContextValue {
  state: TournamentState;
  derived: Derived;
  now: number;
  sync: SyncInfo;
  revision: number;
  /** Aplica un comando (optimista). Muestra toast si el motor lo rechaza. */
  run: (command: Command, options?: { silent?: boolean }) => boolean;
  undo: () => Promise<void>;
  openPlayer: (playerId: string) => void;
  readOnly: boolean;
}

export const EventContext = createContext<EventContextValue | null>(null);

export function useEvent(): EventContextValue {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error('useEvent fuera de EventContext');
  return ctx;
}
