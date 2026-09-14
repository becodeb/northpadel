import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { tournamentConfigSchema, type CourtStatus, type TournamentConfig } from '@domain';
import { FormatForm, PairingForm, ScoringForm, TiebreakersForm } from '@/components/tournament/config-forms';
import { Button } from '@/components/ui/button';
import { Card, Field, Input, Modal, NativeSelect, Textarea } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useEvent } from './event-context';

export function EventSettingsPage() {
  const { state, run } = useEvent();
  const navigate = useNavigate();
  const [config, setConfig] = useState<TournamentConfig>(state.config);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newCourt, setNewCourt] = useState('');

  useEffect(() => {
    if (!dirty) setConfig(state.config);
  }, [state.config, dirty]);

  const update = (patch: Partial<TournamentConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
    setDirty(true);
  };

  const save = () => {
    const parsed = tournamentConfigSchema.safeParse(config);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Configuración inválida');
      return;
    }
    if (run({ type: 'update_config', config: parsed.data })) {
      setDirty(false);
      toast.success('Configuración guardada');
    }
  };

  const remove = async () => {
    try {
      await api.tournaments.remove(state.id);
      navigate('/eventos');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-24">
      <Section title="Evento">
        <div className="flex flex-col gap-4">
          <Field label="Nombre">
            <Input value={config.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <Field label="Descripción (opcional)">
            <Textarea value={config.description} onChange={(e) => update({ description: e.target.value })} className="min-h-20" />
          </Field>
          <Field label="Modo" hint={state.status === 'draft' ? undefined : 'No se puede cambiar una vez creado.'}>
            <NativeSelect value={config.mode} disabled={state.status !== 'draft' || state.players.length > 0} onChange={(e) => update({ mode: e.target.value as TournamentConfig['mode'] })}>
              <option value="rotating">Individual · parejas rotativas</option>
              <option value="fixed_pairs">Parejas fijas</option>
            </NativeSelect>
          </Field>
        </div>
      </Section>

      <Section title="Canchas">
        <div className="flex flex-col gap-2">
          {state.courts
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <Input
                  defaultValue={c.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== c.name) run({ type: 'rename_court', courtId: c.id, name });
                  }}
                  className="flex-1"
                />
                <NativeSelect value={c.status} onChange={(e) => run({ type: 'set_court_status', courtId: c.id, status: e.target.value as CourtStatus })} className="w-44">
                  <option value="available">Disponible</option>
                  <option value="occupied">Ocupada</option>
                  <option value="out_of_service">Fuera de servicio</option>
                </NativeSelect>
              </div>
            ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (run({ type: 'add_court', name: newCourt.trim() || undefined })) setNewCourt('');
            }}
          >
            <Input value={newCourt} onChange={(e) => setNewCourt(e.target.value)} placeholder={`Cancha ${state.courts.length + 1}`} className="flex-1" />
            <Button type="submit" variant="outline">
              <Plus className="h-4 w-4" />
              Agregar
            </Button>
          </form>
        </div>
      </Section>

      <Section title="Partido">
        <FormatForm value={config.format} onChange={(format) => update({ format })} />
      </Section>

      <Section title="Sistema de puntos" hint="Cambiarlo recalcula el ranking al instante.">
        <ScoringForm value={config.scoring} onChange={(scoring) => update({ scoring })} format={config.format} />
      </Section>

      <Section title="Emparejamiento">
        <PairingForm value={config.pairing} onChange={(pairing) => update({ pairing })} mode={config.mode} />
      </Section>

      <Section title="Desempates">
        <TiebreakersForm value={config.tiebreakers} onChange={(tiebreakers) => update({ tiebreakers })} mode={config.mode} />
      </Section>

      <Section title="Otros">
        <Field label='Minutos en estado "descansando" después de un partido'>
          <Input type="number" inputMode="numeric" value={config.restMinutes} onChange={(e) => update({ restMinutes: Number(e.target.value) || 0 })} className="w-32" />
        </Field>
      </Section>

      <Section title="Zona de riesgo">
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" />
            Eliminar evento
          </Button>
        </div>
      </Section>

      {dirty && (
        <div className="safe-bottom fixed inset-x-0 bottom-14 z-30 flex justify-center px-4 md:bottom-4">
          <div className="flex w-full max-w-3xl items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-float">
            <span className="flex-1 text-[14px]">Hay cambios sin guardar</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-white/80 hover:bg-white/10 hover:text-white"
              onClick={() => {
                setConfig(state.config);
                setDirty(false);
              }}
            >
              Descartar
            </Button>
            <Button variant="north" size="sm" onClick={save}>
              Guardar
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="¿Eliminar este evento?"
        description="Se quita del listado y deja de estar accesible."
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" block onClick={remove}>
              Eliminar
            </Button>
          </div>
        }
      />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 md:p-6">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}
