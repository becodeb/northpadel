import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { evaluateSets, formatScore, type Match } from '@domain';
import { CourtCard } from '@/components/tournament/court-card';
import { EditResultDialog } from '@/components/tournament/dialogs';
import { SideNames } from '@/components/tournament/names';
import { Button } from '@/components/ui/button';
import { Badge, Card, SectionTitle } from '@/components/ui/primitives';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useEvent } from './event-context';

export function EventMatchesPage() {
  const { state, derived, openPlayer, readOnly } = useEvent();
  const [editing, setEditing] = useState<Match | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const cancelled = state.matches.filter((m) => m.status === 'cancelled');
  const courtName = (id: string | null) => state.courts.find((c) => c.id === id)?.name ?? '—';

  return (
    <div className="flex flex-col gap-6">
      {derived.onCourt.length > 0 && (
        <section>
          <SectionTitle>En juego</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {derived.onCourt.map((m) => {
              const court = state.courts.find((c) => c.id === m.courtId);
              return court ? <CourtCard key={m.id} court={court} match={m} compact /> : null;
            })}
          </div>
        </section>
      )}

      <section>
        <SectionTitle right={<span className="text-[12px] text-muted">{derived.finished.length} partidos</span>}>Finalizados</SectionTitle>
        <Card className="divide-y divide-line-2">
          {derived.finished.length === 0 ? (
            <p className="px-4 py-6 text-[14px] text-muted">Todavía no hay resultados cargados.</p>
          ) : (
            derived.finished.map((m) => {
              const outcome = evaluateSets(m.sets, state.config.format);
              const winner = outcome.valid ? outcome.winner : null;
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-16 shrink-0">
                    <div className="text-[12px] font-semibold text-ink">{courtName(m.courtId)}</div>
                    <div className="tabular text-[12px] text-muted">{m.finishedAt ? formatTime(m.finishedAt) : ''}</div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className={cn('flex items-center gap-2', winner === 0 && 'font-semibold')}>
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', winner === 0 ? 'bg-north' : 'bg-transparent')} />
                      <SideNames side={m.sides[0]} state={state} size="sm" onPlayerClick={openPlayer} className={cn(winner !== 0 && 'text-muted [&_button]:text-muted')} />
                    </div>
                    <div className={cn('flex items-center gap-2', winner === 1 && 'font-semibold')}>
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', winner === 1 ? 'bg-north' : 'bg-transparent')} />
                      <SideNames side={m.sides[1]} state={state} size="sm" onPlayerClick={openPlayer} className={cn(winner !== 1 && 'text-muted [&_button]:text-muted')} />
                    </div>
                  </div>
                  <div className="tabular shrink-0 text-right text-[15px] font-bold">
                    {m.sets?.map((s, i) => (
                      <div key={i} className="flex flex-col leading-tight">
                        <span className={cn(s[0] < s[1] && 'text-muted')}>{s[0]}</span>
                        <span className={cn(s[1] < s[0] && 'text-muted')}>{s[1]}</span>
                      </div>
                    ))}
                  </div>
                  {!readOnly && (
                    <Button variant="ghost" size="icon-sm" aria-label="Editar resultado" onClick={() => setEditing(m)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </Card>
      </section>

      {cancelled.length > 0 && (
        <section>
          <button onClick={() => setShowCancelled((v) => !v)} className="eyebrow mb-3 hover:text-ink">
            Cancelados ({cancelled.length}) {showCancelled ? '▴' : '▾'}
          </button>
          {showCancelled && (
            <Card className="divide-y divide-line-2">
              {cancelled.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-muted">
                  <span className="w-16 shrink-0">{courtName(m.courtId)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <SideNames side={m.sides[0]} state={state} size="sm" className="[&_button]:text-muted" /> vs{' '}
                    <SideNames side={m.sides[1]} state={state} size="sm" className="[&_button]:text-muted" />
                  </span>
                  <Badge tone="outline">{m.sets ? formatScore(m.sets) : 'cancelado'}</Badge>
                </div>
              ))}
            </Card>
          )}
        </section>
      )}

      <EditResultDialog match={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
