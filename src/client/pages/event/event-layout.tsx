import { ArrowLeft, History, LayoutGrid, ListOrdered, MoreHorizontal, Play, Settings, Share2, Trophy, Tv, Undo2, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { DomainError, type Command } from '@domain';
import { ActivityLog } from '@/components/tournament/activity-log';
import { PlayerSheet } from '@/components/tournament/player-sheet';
import { ShareModal } from '@/components/tournament/share-modal';
import { AppShell, SyncDot } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Badge, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Modal, Spinner, Switch } from '@/components/ui/primitives';
import { useDerived } from '@/lib/derived';
import { formatDuration } from '@/lib/format';
import { useTournamentSession } from '@/lib/tournament-store';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { EventContext, type EventContextValue } from './event-context';

const TABS = [
  { to: '', label: 'Canchas', icon: LayoutGrid, end: true },
  { to: 'jugadores', label: 'Jugadores', icon: Users },
  { to: 'partidos', label: 'Partidos', icon: ListOrdered },
  { to: 'ranking', label: 'Ranking', icon: Trophy },
  { to: 'configuracion', label: 'Config', icon: Settings },
];

export function EventLayout() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { state, revision, status, error, sync, dispatch, undo, session } = useTournamentSession(id);
  const now = useNow(15_000);
  const derived = useDerived(state);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);

  useEffect(() => {
    session.onRejected = (message) => toast.error(message);
    return () => {
      session.onRejected = null;
    };
  }, [session]);

  const run = useCallback(
    (command: Command, options?: { silent?: boolean }) => {
      try {
        dispatch(command);
        return true;
      } catch (err) {
        if (!options?.silent) toast.error(err instanceof DomainError ? err.message : 'No se pudo aplicar el cambio');
        return false;
      }
    },
    [dispatch],
  );

  const doUndo = useCallback(async () => {
    try {
      const cmd = await undo();
      toast.success(cmd ? 'Última acción deshecha' : 'Deshecho');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo deshacer');
    }
  }, [undo]);

  const value = useMemo<EventContextValue | null>(
    () =>
      state && derived
        ? { state, derived, now, sync, revision, run, undo: doUndo, openPlayer: setPlayerId, readOnly: false }
        : null,
    [state, derived, now, sync, revision, run, doUndo],
  );

  if (status === 'error' || (!state && status !== 'loading')) {
    return (
      <AppShell>
        <div className="py-20 text-center">
          <p className="text-[15px] font-medium">{error ?? 'No se encontró el evento'}</p>
          <Link to="/eventos" className="mt-4 inline-block text-[14px] text-north-ink underline">
            Volver a eventos
          </Link>
        </div>
      </AppShell>
    );
  }
  if (!value || !state || !derived) {
    return (
      <AppShell>
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      </AppShell>
    );
  }

  const isLive = state.status === 'live';
  const activeCourts = state.courts.filter((c) => c.status === 'available').length;
  const elapsed = state.startedAt ? (state.finishedAt ?? now) - state.startedAt : 0;

  return (
    <EventContext.Provider value={value}>
      <AppShell
        title={state.config.name}
        actions={
          <div className="flex items-center gap-1">
            <SyncDot pending={sync.pending} syncing={sync.syncing} />
          </div>
        }
      >
        {/* Cabecera del evento */}
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Link to="/eventos" className="press mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-canvas-2 hover:text-ink md:hidden" aria-label="Volver">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-[22px] font-bold tracking-tight text-ink md:text-[26px]">{state.config.name}</h1>
                {isLive ? (
                  <Badge tone="north" dot>
                    En vivo
                  </Badge>
                ) : state.status === 'finished' ? (
                  <Badge tone="neutral">Finalizado</Badge>
                ) : (
                  <Badge tone="ink">Por comenzar</Badge>
                )}
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-muted">
                <span>
                  <b className="tabular font-semibold text-ink">{activeCourts}</b> cancha{activeCourts === 1 ? '' : 's'} activa{activeCourts === 1 ? '' : 's'}
                </span>
                <span>
                  <b className="tabular font-semibold text-ink">{state.players.filter((p) => p.availability !== 'absent').length}</b> jugadores
                </span>
                <span>
                  <b className="tabular font-semibold text-ink">{derived.finishedCount}</b> partidos
                </span>
                {state.startedAt && (
                  <span>
                    <b className="tabular font-semibold text-ink">{formatDuration(elapsed)}</b> de torneo
                  </span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {state.status === 'draft' && (
                <Button variant="north" size="md" className="hidden md:inline-flex" onClick={() => run({ type: 'start_tournament' })}>
                  <Play className="h-4 w-4" />
                  Comenzar torneo
                </Button>
              )}
              <Button variant="outline" size="icon" aria-label="Compartir / QR" onClick={() => setShareOpen(true)}>
                <Share2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" aria-label="Pantalla TV" className="hidden md:inline-flex" onClick={() => window.open(`/eventos/${state.id}/live`, '_blank')}>
                <Tv className="h-4 w-4" />
              </Button>
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Más acciones">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem icon={<History />} onSelect={() => setLogOpen(true)}>
                    Historial de cambios
                  </MenuItem>
                  <MenuItem icon={<Undo2 />} onSelect={() => void doUndo()}>
                    Deshacer última acción
                  </MenuItem>
                  <MenuItem icon={<Tv />} onSelect={() => window.open(`/eventos/${state.id}/live`, '_blank')}>
                    Abrir pantalla TV
                  </MenuItem>
                  <MenuSeparator />
                  {isLive && (
                    <div className="px-3 py-1.5">
                      <Switch
                        checked={state.autoAssign}
                        onCheckedChange={(v) => run({ type: 'set_auto_assign', enabled: v })}
                        label={<span className="text-[14px]">Asignación automática</span>}
                      />
                    </div>
                  )}
                  {isLive && (
                    <MenuItem icon={<Trophy />} onSelect={() => setConfirmFinish(true)}>
                      Finalizar torneo
                    </MenuItem>
                  )}
                  {state.status === 'finished' && (
                    <MenuItem icon={<Play />} onSelect={() => run({ type: 'reopen_tournament' })}>
                      Reabrir torneo
                    </MenuItem>
                  )}
                  {state.status === 'draft' && (
                    <MenuItem icon={<Play />} onSelect={() => run({ type: 'start_tournament' })}>
                      Comenzar torneo
                    </MenuItem>
                  )}
                </MenuContent>
              </Menu>
            </div>
          </div>

          {/* Tabs desktop */}
          <nav className="no-scrollbar -mx-4 hidden gap-1 overflow-x-auto border-b border-line-2 px-4 md:flex md:px-0">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cn(
                    'press -mb-px flex h-11 items-center gap-2 border-b-2 px-3 text-[14px] font-medium',
                    isActive ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
                  )
                }
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <Outlet />

        {/* Tab bar mobile */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line-2 bg-surface/95 backdrop-blur-md md:hidden">
          <div className="grid grid-cols-5">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cn('press flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium', isActive ? 'text-ink' : 'text-muted')
                }
              >
                {({ isActive }) => (
                  <>
                    <t.icon className={cn('h-5 w-5', isActive && 'text-north')} strokeWidth={isActive ? 2.4 : 2} />
                    {t.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        <PlayerSheet playerId={playerId} onClose={() => setPlayerId(null)} />
        <ActivityLog open={logOpen} onOpenChange={setLogOpen} />
        <ShareModal open={shareOpen} onOpenChange={setShareOpen} tournamentId={state.id} name={state.config.name} />
        <Modal
          open={confirmFinish}
          onOpenChange={setConfirmFinish}
          title="¿Finalizar el torneo?"
          description="Los partidos en juego se cancelan y se muestra la pantalla final. Podés reabrirlo después."
          size="sm"
          footer={
            <div className="flex gap-2">
              <Button variant="secondary" block onClick={() => setConfirmFinish(false)}>
                Seguir jugando
              </Button>
              <Button
                block
                onClick={() => {
                  setConfirmFinish(false);
                  if (run({ type: 'finish_tournament' })) navigate(`/eventos/${state.id}`);
                }}
              >
                Finalizar
              </Button>
            </div>
          }
        />
      </AppShell>
    </EventContext.Provider>
  );
}
