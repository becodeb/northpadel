import {
  ArrowLeftRight,
  Ban,
  ChevronRight,
  MoreHorizontal,
  Play,
  RefreshCw,
  Repeat,
  Shuffle,
  UserCog,
  Wrench,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Court, Match, SetScore } from '@domain';
import { formatScore } from '@domain';
import { Button } from '@/components/ui/button';
import { Badge, Card, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/primitives';
import { formatMinutes } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useEvent } from '@/pages/event/event-context';
import { SwapPlayerDialog } from './dialogs';
import { SideNames } from './names';
import { ScoreEntry } from './score-entry';

type Phase = 'idle' | 'entering' | 'searching' | 'ready';

/**
 * Tarjeta de cancha: el corazón operativo. Muestra el partido en juego y
 * permite cargar el resultado en el mismo lugar, sin navegar.
 */
export function CourtCard({ court, match, compact = false }: { court: Court; match: Match | null; compact?: boolean }) {
  const { state, derived, now, run, openPlayer, readOnly } = useEvent();
  const [phase, setPhase] = useState<Phase>('idle');
  const [swapOpen, setSwapOpen] = useState(false);
  const lastMatchId = useRef<string | null>(match?.id ?? null);

  // Microinteracción: al finalizar, "Buscando próximo partido…" y luego "Partido listo".
  useEffect(() => {
    if (match?.id && match.id !== lastMatchId.current && phase === 'searching') {
      const t = setTimeout(() => setPhase('ready'), 550);
      const t2 = setTimeout(() => setPhase('idle'), 2600);
      lastMatchId.current = match.id;
      return () => {
        clearTimeout(t);
        clearTimeout(t2);
      };
    }
    if (!match && phase === 'searching') {
      const t = setTimeout(() => setPhase('idle'), 1200);
      return () => clearTimeout(t);
    }
    lastMatchId.current = match?.id ?? null;
    return undefined;
  }, [match?.id, phase, match]);

  const submit = (sets: SetScore[]) => {
    if (!match) return;
    const ok = run({ type: 'record_result', matchId: match.id, sets });
    if (ok) setPhase('searching');
  };

  const unavailable = court.status !== 'available';
  const elapsed = match?.startedAt ? now - match.startedAt : null;
  const isLive = state.status === 'live';

  return (
    <Card
      className={cn(
        'relative flex flex-col overflow-hidden transition-colors',
        phase === 'ready' && 'animate-flash',
        unavailable && 'bg-canvas-2/60',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3.5 md:px-5">
        <span className="eyebrow text-ink">{court.name}</span>
        {match && match.status === 'in_progress' && elapsed != null && (
          <span className="tabular flex items-center gap-1.5 text-[12px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-north" />
            {formatMinutes(elapsed)}
          </span>
        )}
        {match && match.status === 'scheduled' && <Badge tone="north">Listo</Badge>}
        {phase === 'ready' && <Badge tone="north">Partido listo</Badge>}
        {unavailable && <Badge tone="amber">{court.status === 'occupied' ? 'Ocupada' : 'Fuera de servicio'}</Badge>}
        {!readOnly && (
          <div className="ml-auto -mr-2">
            <CourtMenu court={court} match={match} onSwap={() => setSwapOpen(true)} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col px-4 pb-4 pt-2 md:px-5">
        {match ? (
          phase === 'entering' ? (
            <ScoreEntry
              state={state}
              sides={match.sides}
              onSubmit={submit}
              onCancel={() => setPhase('idle')}
            />
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <SideNames side={match.sides[0]} state={state} derived={derived} withRank size={compact ? 'md' : 'lg'} onPlayerClick={openPlayer} />
                <span className="text-[12px] font-semibold uppercase tracking-widest text-muted-2">vs</span>
                <SideNames side={match.sides[1]} state={state} derived={derived} withRank size={compact ? 'md' : 'lg'} onPlayerClick={openPlayer} />
              </div>
              {match.reason && <p className="mt-2 text-[12px] text-muted">{match.reason}</p>}
              {!readOnly && isLive && (
                <div className="mt-3 flex gap-2">
                  {match.status === 'scheduled' && (
                    <Button variant="north" size="lg" block onClick={() => run({ type: 'start_match', matchId: match.id })}>
                      <Play className="h-4 w-4" />
                      Iniciar partido
                    </Button>
                  )}
                  <Button size="lg" block variant={match.status === 'scheduled' ? 'outline' : 'primary'} onClick={() => setPhase('entering')}>
                    Cargar resultado
                  </Button>
                </div>
              )}
            </>
          )
        ) : (
          <FreeCourtBody court={court} phase={phase} />
        )}
      </div>

      {match && !readOnly && (
        <SwapPlayerDialog open={swapOpen} onOpenChange={setSwapOpen} match={match} />
      )}
    </Card>
  );
}

function FreeCourtBody({ court, phase }: { court: Court; phase: Phase }) {
  const { state, derived, run, readOnly } = useEvent();
  if (court.status !== 'available') {
    return (
      <div className="flex min-h-24 flex-col items-start justify-center gap-2">
        <p className="text-[14px] text-muted">
          {court.status === 'occupied' ? 'Ocupada temporalmente (fuera del torneo).' : 'Fuera de servicio.'}
        </p>
        {!readOnly && (
          <Button variant="outline" size="sm" onClick={() => run({ type: 'set_court_status', courtId: court.id, status: 'available' })}>
            Habilitar cancha
          </Button>
        )}
      </div>
    );
  }
  if (phase === 'searching') {
    return (
      <div className="flex min-h-24 items-center gap-3 text-[14px] text-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-north" />
        Buscando próximo partido…
      </div>
    );
  }
  if (state.status !== 'live') {
    return <p className="flex min-h-24 items-center text-[14px] text-muted">Cancha lista.</p>;
  }
  const waiting = derived.stats.list.filter((s) => !s.currentMatchId && !s.queuedMatchId).length;
  return (
    <div className="flex min-h-24 flex-col items-start justify-center gap-2">
      <p className="text-[15px] font-medium text-ink">Cancha libre</p>
      <p className="text-[13px] text-muted">
        {!state.autoAssign
          ? 'Asignación automática pausada. Activala o armá un partido manual.'
          : waiting < (state.config.mode === 'fixed_pairs' ? 2 : 4)
            ? 'Esperando que se liberen jugadores…'
            : 'Esperando jugadores disponibles…'}
      </p>
      {!readOnly && !state.autoAssign && (
        <Button variant="north" size="sm" onClick={() => run({ type: 'set_auto_assign', enabled: true })}>
          Activar asignación automática
        </Button>
      )}
    </div>
  );
}

function CourtMenu({ court, match, onSwap }: { court: Court; match: Match | null; onSwap: () => void }) {
  const { state, derived, run } = useEvent();
  const freeOthers = state.courts.filter((c) => c.id !== court.id && derived.freeCourtIds.has(c.id));
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Opciones de la cancha">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </MenuTrigger>
      <MenuContent>
        {match && (
          <>
            <MenuLabel>Partido</MenuLabel>
            {match.status === 'scheduled' && (
              <MenuItem icon={<Play />} onSelect={() => run({ type: 'start_match', matchId: match.id })}>
                Iniciar partido
              </MenuItem>
            )}
            <MenuItem icon={<UserCog />} onSelect={onSwap}>
              Cambiar jugador
            </MenuItem>
            {state.config.mode === 'rotating' && (
              <MenuItem icon={<Shuffle />} onSelect={() => run({ type: 'rotate_pairs', matchId: match.id })}>
                Cambiar parejas
              </MenuItem>
            )}
            <MenuItem icon={<ArrowLeftRight />} onSelect={() => run({ type: 'swap_sides', matchId: match.id })}>
              Intercambiar lados
            </MenuItem>
            {freeOthers.map((c) => (
              <MenuItem key={c.id} icon={<ChevronRight />} onSelect={() => run({ type: 'move_match', matchId: match.id, courtId: c.id })}>
                Mover a {c.name}
              </MenuItem>
            ))}
            <MenuItem icon={<ChevronRight />} onSelect={() => run({ type: 'move_match', matchId: match.id, courtId: null })}>
              Volver a próximos
            </MenuItem>
            <MenuItem icon={<RefreshCw />} onSelect={() => run({ type: 'regenerate_match', matchId: match.id })}>
              Rehacer partido
            </MenuItem>
            <MenuItem icon={<Ban />} danger onSelect={() => run({ type: 'cancel_match', matchId: match.id })}>
              Cancelar partido
            </MenuItem>
            <MenuSeparator />
          </>
        )}
        <MenuLabel>{court.name}</MenuLabel>
        {court.status !== 'available' && (
          <MenuItem icon={<Repeat />} onSelect={() => run({ type: 'set_court_status', courtId: court.id, status: 'available' })}>
            Disponible
          </MenuItem>
        )}
        {court.status !== 'occupied' && (
          <MenuItem icon={<Wrench />} onSelect={() => run({ type: 'set_court_status', courtId: court.id, status: 'occupied' })}>
            Marcar ocupada
          </MenuItem>
        )}
        {court.status !== 'out_of_service' && (
          <MenuItem icon={<Ban />} onSelect={() => run({ type: 'set_court_status', courtId: court.id, status: 'out_of_service' })}>
            Fuera de servicio
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
}

export function ScoreLine({ sets, perspective = 0 }: { sets: SetScore[] | null; perspective?: 0 | 1 }) {
  return <span className="tabular font-semibold">{formatScore(sets, perspective)}</span>;
}
