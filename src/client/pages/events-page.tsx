import { ArrowRight, Copy, MoreHorizontal, Plus, Trash2, Tv } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { modeLabel, PRESET_LABELS } from '@domain';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Modal, Spinner } from '@/components/ui/primitives';
import { api, type TournamentSummary } from '@/lib/api';
import { dayLabel, formatTime } from '@/lib/format';
import { realtime } from '@/lib/ws';

const STATUS: Record<TournamentSummary['status'], { label: string; tone: 'north' | 'neutral' | 'ink' }> = {
  live: { label: 'En vivo', tone: 'north' },
  draft: { label: 'Por comenzar', tone: 'ink' },
  finished: { label: 'Finalizado', tone: 'neutral' },
};

export function EventsPage() {
  const [items, setItems] = useState<TournamentSummary[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TournamentSummary | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.tournaments
      .list()
      .then((r) => setItems(r.tournaments))
      .catch((e) => toast.error(e.message));
  }, []);

  useEffect(() => {
    load();
    realtime.start();
    return realtime.onListChanged(load);
  }, [load]);

  const groups = useMemo(() => {
    if (!items) return [];
    const sorted = items.slice().sort((a, b) => {
      const rank = (s: TournamentSummary['status']) => (s === 'live' ? 0 : s === 'draft' ? 1 : 2);
      return rank(a.status) - rank(b.status) || b.updatedAt - a.updatedAt;
    });
    const map = new Map<string, TournamentSummary[]>();
    for (const t of sorted) {
      const key = t.status === 'finished' ? dayLabel(t.finishedAt ?? t.updatedAt) : t.status === 'live' ? 'En curso' : 'Por comenzar';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [items]);

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await api.tournaments.remove(confirmDelete.id);
      toast.success('Evento eliminado');
      setConfirmDelete(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <AppShell>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink">Eventos</h1>
          <p className="mt-1 text-[14px] text-muted">Canchas abiertas, americanos y torneos del club.</p>
        </div>
        <Link to="/eventos/nuevo" className="md:hidden">
          <Button size="md">
            <Plus className="h-4 w-4" />
            Nuevo
          </Button>
        </Link>
      </div>

      {!items ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title="Todavía no hay eventos"
            description="Creá tu primera cancha abierta: nombres, canchas, reglas y a jugar."
            action={
              <Link to="/eventos/nuevo">
                <Button>
                  <Plus className="h-4 w-4" />
                  Crear evento
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(([label, list]) => (
            <section key={label}>
              <h2 className="eyebrow mb-3">{label}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((t) => (
                  <EventCard
                    key={t.id}
                    t={t}
                    onOpen={() => navigate(`/eventos/${t.id}`)}
                    onDuplicate={() => navigate(`/eventos/nuevo?from=${t.id}`)}
                    onDelete={() => setConfirmDelete(t)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="¿Eliminar este evento?"
        description={confirmDelete?.name}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button variant="danger" block onClick={remove}>
              Eliminar
            </Button>
          </div>
        }
      >
        <p className="text-[14px] text-muted">Se quita del listado. El historial de partidos deja de ser visible.</p>
      </Modal>
    </AppShell>
  );
}

function EventCard({
  t,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  t: TournamentSummary;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const status = STATUS[t.status];
  const when = t.status === 'live' ? t.startedAt : t.status === 'finished' ? t.finishedAt : t.scheduledAt ?? t.createdAt;
  return (
    <Card className="group relative flex flex-col gap-3 p-4 transition-shadow hover:shadow-float md:p-5">
      <button onClick={onOpen} className="absolute inset-0 rounded-[var(--radius-card)] focus-ring" aria-label={`Abrir ${t.name}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone={status.tone} dot={t.status === 'live'}>
              {status.label}
            </Badge>
            {when && <span className="text-[12px] text-muted">{formatTime(when)}</span>}
          </div>
          <h3 className="mt-2 truncate text-[17px] font-semibold text-ink">{t.name}</h3>
          <p className="mt-0.5 text-[13px] text-muted">
            {PRESET_LABELS[t.preset]?.title ?? modeLabel(t.mode)} · {modeLabel(t.mode)}
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-1">
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Más opciones">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={<Copy />} onSelect={onDuplicate}>
                Duplicar evento
              </MenuItem>
              <MenuItem icon={<Tv />} onSelect={() => window.open(`/eventos/${t.id}/live`, '_blank')}>
                Abrir pantalla TV
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Trash2 />} danger onSelect={onDelete}>
                Eliminar
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>
      <div className="flex items-center gap-4 text-[13px] text-muted">
        <span>
          <strong className="tabular font-semibold text-ink">{t.playersCount}</strong> {t.mode === 'fixed_pairs' ? 'jugadores' : 'jugadores'}
        </span>
        <span>
          <strong className="tabular font-semibold text-ink">{t.courtsCount}</strong> canchas
        </span>
        <span>
          <strong className="tabular font-semibold text-ink">{t.finishedMatches}</strong> partidos
        </span>
        <ArrowRight className="ml-auto h-4 w-4 text-muted-2 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Card>
  );
}
