import { ChevronRight, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, Card, Menu, MenuContent, MenuItem, MenuTrigger, SectionTitle } from '@/components/ui/primitives';
import { useEvent } from '@/pages/event/event-context';
import { CreateMatchDialog } from './dialogs';
import { SideNames } from './names';

export function UpcomingList({ limit }: { limit?: number }) {
  const { state, derived, run, readOnly, openPlayer } = useEvent();
  const [createOpen, setCreateOpen] = useState(false);
  const items = limit ? derived.upcoming.slice(0, limit) : derived.upcoming;
  const free = state.courts.filter((c) => derived.freeCourtIds.has(c.id));

  return (
    <section>
      <SectionTitle
        right={
          !readOnly && state.status === 'live' ? (
            <Button variant="subtle" size="xs" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Partido manual
            </Button>
          ) : null
        }
      >
        Próximos
      </SectionTitle>
      <Card className="divide-y divide-line-2">
        {items.length === 0 ? (
          <p className="px-4 py-5 text-[14px] text-muted">
            {state.status !== 'live' ? 'El torneo todavía no comenzó.' : 'No hay suficientes jugadores esperando para armar otro partido.'}
          </p>
        ) : (
          items.map((u, i) => (
            <div key={u.matchId ?? `p${i}`} className="flex items-center gap-3 px-4 py-3">
              <span className="tabular w-5 shrink-0 text-[13px] font-semibold text-muted-2">{i + 1}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <SideNames side={u.sides[0]} state={state} size="md" onPlayerClick={openPlayer} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">vs</span>
                  <SideNames side={u.sides[1]} state={state} size="md" onPlayerClick={openPlayer} />
                </div>
                {u.reason && <span className="text-[12px] text-muted">{u.reason}</span>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {u.kind === 'queued' ? <Badge tone="magenta">Manual</Badge> : <Badge tone="outline">Estimado</Badge>}
                {!readOnly && u.kind === 'queued' && u.matchId && (
                  <Menu>
                    <MenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Opciones">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      {free.map((c) => (
                        <MenuItem key={c.id} icon={<ChevronRight />} onSelect={() => run({ type: 'move_match', matchId: u.matchId!, courtId: c.id })}>
                          Jugar en {c.name}
                        </MenuItem>
                      ))}
                      <MenuItem icon={<Trash2 />} danger onSelect={() => run({ type: 'cancel_match', matchId: u.matchId! })}>
                        Quitar de la cola
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                )}
              </div>
            </div>
          ))
        )}
      </Card>
      {!readOnly && <CreateMatchDialog open={createOpen} onOpenChange={setCreateOpen} />}
    </section>
  );
}
