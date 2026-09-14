import { AlertTriangle, Play, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { describeFormat, STRATEGY_LABELS } from '@domain';
import { AddPlayerDialog } from '@/components/tournament/dialogs';
import { CourtCard } from '@/components/tournament/court-card';
import { FinalScreen } from '@/components/tournament/final-screen';
import { RankingTable } from '@/components/tournament/ranking-table';
import { UpcomingList } from '@/components/tournament/upcoming-list';
import { WaitingList } from '@/components/tournament/waiting-list';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/primitives';
import { useWarnings } from '@/lib/derived';
import { cn } from '@/lib/utils';
import { useEvent } from './event-context';

export function EventDashboardPage() {
  const { state, derived, now, run } = useEvent();
  const warnings = useWarnings(state, derived, now);

  if (state.status === 'finished') {
    return (
      <div className="flex flex-col gap-6">
        <FinalScreen state={state} ranking={derived.ranking} onReopen={() => run({ type: 'reopen_tournament' })} />
        <RankingTable title="Tabla final" />
      </div>
    );
  }

  if (state.status === 'draft') return <DraftPanel />;

  const courts = state.courts.slice().sort((a, b) => a.order - b.order);
  const matchByCourt = new Map(derived.onCourt.map((m) => [m.courtId, m]));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-6">
        {warnings.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {warnings.slice(0, 3).map((w) => (
              <div
                key={`${w.kind}-${w.competitorId}`}
                className={cn(
                  'flex items-center gap-2 rounded-2xl px-3.5 py-2 text-[13px]',
                  w.severity === 'warning' ? 'bg-amber-soft text-amber-ink' : 'bg-canvas-2 text-muted',
                )}
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {w.message}
              </div>
            ))}
          </div>
        )}

        <section>
          <SectionTitle
            right={
              !state.autoAssign ? (
                <button onClick={() => run({ type: 'set_auto_assign', enabled: true })} className="text-[12px] font-medium text-magenta-ink underline">
                  Asignación automática pausada
                </button>
              ) : null
            }
          >
            Canchas
          </SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {courts.map((c) => (
              <CourtCard key={c.id} court={c} match={matchByCourt.get(c.id) ?? null} />
            ))}
          </div>
        </section>

        <UpcomingList />

        <div className="xl:hidden">
          <RankingTable limit={8} compact />
        </div>

        <WaitingList limit={12} />
      </div>

      <aside className="hidden xl:block">
        <div className="sticky top-20">
          <RankingTable limit={14} compact />
        </div>
      </aside>
    </div>
  );
}

function DraftPanel() {
  const { state, run } = useEvent();
  const [addOpen, setAddOpen] = useState(false);
  const isTeam = state.config.mode === 'fixed_pairs';
  const active = isTeam
    ? state.teams.filter((t) => t.playerIds.every((id) => state.players.find((p) => p.id === id)?.availability === 'active')).length
    : state.players.filter((p) => p.availability === 'active').length;
  const needed = isTeam ? 2 : 4;
  const ready = active >= needed && state.courts.length > 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Card className="p-6 md:p-8">
        <span className="eyebrow">Listo para comenzar</span>
        <h2 className="mt-2 text-[22px] font-bold tracking-tight">{state.config.name}</h2>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[14px] md:grid-cols-4">
          <Item label={isTeam ? 'Parejas' : 'Jugadores'} value={String(isTeam ? state.teams.length : state.players.length)} />
          <Item label="Canchas" value={String(state.courts.length)} />
          <Item label="Partido" value={describeFormat(state.config.format)} />
          <Item label="Emparejamiento" value={STRATEGY_LABELS[state.config.pairing.strategy].title} />
        </dl>
        {!ready && (
          <p className="mt-4 rounded-2xl bg-amber-soft px-3.5 py-2 text-[13px] text-amber-ink">
            {state.courts.length === 0
              ? 'Agregá al menos una cancha en Configuración.'
              : `Faltan ${isTeam ? 'parejas' : 'jugadores'}: hay ${active} y se necesitan ${needed}.`}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button variant="north" size="xl" block disabled={!ready} onClick={() => run({ type: 'start_tournament' })}>
            <Play className="h-5 w-5" />
            Comenzar torneo
          </Button>
          <Button variant="outline" size="xl" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-5 w-5" />
            {isTeam ? 'Agregar pareja' : 'Agregar jugador'}
          </Button>
        </div>
        <p className="mt-4 text-[13px] text-muted">
          Al comenzar, el motor arma los primeros partidos en todas las canchas.{' '}
          <Link to="configuracion" className="text-north-ink underline">
            Revisar configuración
          </Link>
        </p>
      </Card>
      <AddPlayerDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 font-semibold text-ink">{value}</dd>
    </div>
  );
}
