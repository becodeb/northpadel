import { Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { COMMAND_LABELS, type ActivityEntry, type CommandType } from '@domain';
import { Button } from '@/components/ui/button';
import { Modal, Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useEvent } from '@/pages/event/event-context';

/** Historial de cambios con "Deshacer" para el último. */
export function ActivityLog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { state, revision, undo, readOnly } = useEvent();
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.tournaments
      .events(state.id)
      .then((r) => {
        if (!cancelled) setEntries(r.activity);
      })
      .catch((e) => toast.error(e.message));
    return () => {
      cancelled = true;
    };
  }, [open, state.id, revision]);

  const doUndo = async () => {
    setBusy(true);
    try {
      await undo();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Historial de cambios" description="Cada acción del organizador queda registrada." size="md">
      {!entries ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-muted">Todavía no hay acciones.</p>
      ) : (
        <ul className="flex flex-col">
          {entries.map((e) => (
            <li key={e.batchId} className={cn('flex gap-3 border-b border-line-2 py-3 last:border-0', e.undone && 'opacity-45')}>
              <span className="tabular w-12 shrink-0 pt-0.5 text-[12px] font-medium text-muted">{formatTime(e.at)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink">
                  {e.actorName ? `${e.actorName} · ` : ''}
                  {COMMAND_LABELS[e.commandType as CommandType] ?? e.commandType}
                  {e.undone && <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-muted">deshecho</span>}
                </p>
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {e.lines.map((l, i) => (
                    <li key={i} className="text-[13px] text-muted">
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
              {e.canUndo && !readOnly && (
                <Button variant="outline" size="sm" onClick={doUndo} loading={busy} className="shrink-0">
                  <Undo2 className="h-4 w-4" />
                  Deshacer
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
