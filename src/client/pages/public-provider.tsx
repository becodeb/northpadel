import { useMemo, useState, type ReactNode } from 'react';
import { PlayerSheet } from '@/components/tournament/player-sheet';
import { useDerived } from '@/lib/derived';
import { useTournamentSession } from '@/lib/tournament-store';
import { useNow } from '@/lib/use-now';
import { EventContext, type EventContextValue } from './event/event-context';

/** Provee el contexto del evento en modo solo lectura (TV y jugadores). */
export function PublicEventProvider({
  id,
  children,
  fallback,
  withPlayerSheet = true,
}: {
  id: string;
  children: (ctx: EventContextValue) => ReactNode;
  fallback: (status: 'loading' | 'error', error: string | null) => ReactNode;
  withPlayerSheet?: boolean;
}) {
  const { state, revision, status, error, sync } = useTournamentSession(id, { publicOnly: true });
  const now = useNow(10_000);
  const derived = useDerived(state);
  const [playerId, setPlayerId] = useState<string | null>(null);

  const value = useMemo<EventContextValue | null>(
    () =>
      state && derived
        ? {
            state,
            derived,
            now,
            sync,
            revision,
            run: () => false,
            undo: async () => undefined,
            openPlayer: withPlayerSheet ? setPlayerId : () => undefined,
            readOnly: true,
          }
        : null,
    [state, derived, now, sync, revision, withPlayerSheet],
  );

  if (!value) return <>{fallback(status === 'error' ? 'error' : 'loading', error)}</>;
  return (
    <EventContext.Provider value={value}>
      {children(value)}
      {withPlayerSheet && <PlayerSheet playerId={playerId} onClose={() => setPlayerId(null)} />}
    </EventContext.Provider>
  );
}
