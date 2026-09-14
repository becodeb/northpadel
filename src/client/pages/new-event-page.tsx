import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Check, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  createTournamentSchema,
  modeLabel,
  PRESET_LABELS,
  presetConfig,
  type CreateTournamentInput,
  type PresetId,
  type TournamentConfig,
} from '@domain';
import { AppShell } from '@/components/layout/app-shell';
import { FormatForm, PairingForm, ScoringForm, TiebreakersForm } from '@/components/tournament/config-forms';
import { Button } from '@/components/ui/button';
import { Card, Field, Input, NativeSelect, Segmented, Textarea } from '@/components/ui/primitives';
import { Counter } from '@/components/ui/stepper';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const STEPS = ['Tipo', 'Jugadores', 'Canchas', 'Partido', 'Puntos'] as const;

interface DraftPlayer {
  key: string;
  name: string;
  level: number | null;
}

interface DraftTeam {
  key: string;
  a: DraftPlayer;
  b: DraftPlayer;
}

const PRESETS: PresetId[] = ['north_open', 'americano', 'mexicano', 'fixed_pairs', 'custom'];

const detailsSchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre').max(80),
  description: z.string().max(500),
  scheduledAt: z.string(),
});
type Details = z.infer<typeof detailsSchema>;

let keyCounter = 0;
const nextKey = () => `k${++keyCounter}`;

/** "Juan Perez, 4" / "Juan Perez - 4" / "Juan Perez (4)" → nombre + nivel. */
function parsePlayerLine(line: string): DraftPlayer | null {
  let text = line.trim().replace(/^\d+[.)]\s*/, '');
  if (!text) return null;
  let level: number | null = null;
  const m = text.match(/^(.*?)(?:[\s,;\t\-–(]+)\(?([1-5])\)?$/);
  if (m) {
    text = m[1].trim();
    level = Number(m[2]);
  }
  if (!text) return null;
  return { key: nextKey(), name: text, level };
}

function parsePlayers(raw: string): DraftPlayer[] {
  return raw
    .split(/\r?\n|;/)
    .map(parsePlayerLine)
    .filter((p): p is DraftPlayer => !!p);
}

function parseTeams(raw: string): DraftTeam[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const teams: DraftTeam[] = [];
  const loose: DraftPlayer[] = [];
  for (const line of lines) {
    const parts = line.split(/\s*(?:\+|\/|&| y )\s*/);
    if (parts.length >= 2) {
      const a = parsePlayerLine(parts[0]);
      const b = parsePlayerLine(parts[1]);
      if (a && b) teams.push({ key: nextKey(), a, b });
    } else {
      const p = parsePlayerLine(line);
      if (p) loose.push(p);
    }
  }
  for (let i = 0; i + 1 < loose.length; i += 2) teams.push({ key: nextKey(), a: loose[i], b: loose[i + 1] });
  if (loose.length % 2 === 1) teams.push({ key: nextKey(), a: loose[loose.length - 1], b: { key: nextKey(), name: '', level: null } });
  return teams;
}

export function NewEventPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fromId = params.get('from');
  const [step, setStep] = useState(0);
  const [preset, setPreset] = useState<PresetId>('north_open');
  const [config, setConfig] = useState<TournamentConfig>(() => presetConfig('north_open'));
  const [players, setPlayers] = useState<DraftPlayer[]>([]);
  const [teams, setTeams] = useState<DraftTeam[]>([]);
  const [courts, setCourts] = useState<string[]>(['Cancha 1', 'Cancha 2', 'Cancha 3', 'Cancha 4']);
  const [paste, setPaste] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingFrom, setLoadingFrom] = useState(!!fromId);

  const form = useForm<Details>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { name: config.name, description: '', scheduledAt: '' },
  });

  // Duplicar evento: precarga configuración, jugadores y canchas.
  useEffect(() => {
    if (!fromId) return;
    api.tournaments
      .get(fromId)
      .then(({ state }) => {
        setPreset(state.config.preset);
        setConfig({ ...state.config, scheduledAt: null });
        form.reset({ name: state.config.name, description: state.config.description, scheduledAt: '' });
        setCourts(state.courts.slice().sort((a, b) => a.order - b.order).map((c) => c.name));
        const active = state.players.filter((p) => p.availability !== 'absent');
        if (state.config.mode === 'fixed_pairs') {
          setTeams(
            state.teams
              .map((t) => {
                const a = active.find((p) => p.id === t.playerIds[0]);
                const b = active.find((p) => p.id === t.playerIds[1]);
                return a && b ? { key: nextKey(), a: { key: nextKey(), name: a.name, level: a.level }, b: { key: nextKey(), name: b.name, level: b.level } } : null;
              })
              .filter((t): t is DraftTeam => !!t),
          );
        } else {
          setPlayers(active.map((p) => ({ key: nextKey(), name: p.name, level: p.level })));
        }
        toast.success('Evento duplicado: revisá y creá');
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoadingFrom(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId]);

  const choosePreset = (p: PresetId) => {
    setPreset(p);
    const next = presetConfig(p);
    setConfig(next);
    form.setValue('name', next.name);
  };

  const isTeam = config.mode === 'fixed_pairs';
  const count = isTeam ? teams.filter((t) => t.a.name.trim() && t.b.name.trim()).length : players.filter((p) => p.name.trim()).length;
  const minCount = isTeam ? 2 : 4;

  const addFromPaste = () => {
    if (isTeam) setTeams((prev) => [...prev, ...parseTeams(paste)]);
    else setPlayers((prev) => [...prev, ...parsePlayers(paste)]);
    setPaste('');
  };

  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '').replace(/,\s*(?=[1-5]\s*$)/gm, ', ');
      const cleaned = text
        .split(/\r?\n/)
        .map((l) => l.split(/[,\t]/).map((c) => c.replace(/^"|"$/g, '').trim()).filter(Boolean).join(isTeam ? ' + ' : ', '))
        .join('\n');
      if (isTeam) setTeams((prev) => [...prev, ...parseTeams(cleaned)]);
      else setPlayers((prev) => [...prev, ...parsePlayers(cleaned)]);
    };
    reader.readAsText(file);
  };

  const canContinue = useMemo(() => {
    if (step === 1) return count >= minCount;
    if (step === 2) return courts.length > 0;
    return true;
  }, [step, count, minCount, courts.length]);

  const submit = form.handleSubmit(async (details) => {
    const scheduledAt = details.scheduledAt ? new Date(details.scheduledAt).getTime() : null;
    const finalConfig: TournamentConfig = { ...config, name: details.name.trim(), description: details.description, scheduledAt, preset };
    const playerList = isTeam ? teams.flatMap((t) => [t.a, t.b]) : players;
    const input: CreateTournamentInput = {
      config: finalConfig,
      players: playerList.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), level: p.level })),
      teams: isTeam ? teams.filter((t) => t.a.name.trim() && t.b.name.trim()).map((_, i) => ({ playerIndexes: [i * 2, i * 2 + 1] as [number, number] })) : undefined,
      courts: courts.map((name) => ({ name: name.trim() || 'Cancha' })),
    };
    const parsed = createTournamentSchema.safeParse(input);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Revisá los datos');
      return;
    }
    setSaving(true);
    try {
      const { state } = await api.tournaments.create(parsed.data);
      navigate(`/eventos/${state.id}`, { replace: true });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo crear el evento');
    } finally {
      setSaving(false);
    }
  });

  const goNext = () => {
    if (step === 0) {
      void form.trigger('name').then((ok) => ok && setStep(1));
      return;
    }
    if (step < STEPS.length - 1) setStep(step + 1);
    else void submit();
  };

  return (
    <AppShell title="Nuevo evento">
      <div className="mx-auto max-w-2xl pb-28">
        {/* Progreso */}
        <ol className="mb-6 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                className={cn(
                  'tabular flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold',
                  i === step ? 'bg-ink text-white' : i < step ? 'bg-north-soft text-north-ink' : 'bg-canvas-2 text-muted',
                )}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </button>
              <span className={cn('hidden text-[13px] font-medium sm:inline', i === step ? 'text-ink' : 'text-muted')}>{s}</span>
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-line sm:w-6" />}
            </li>
          ))}
        </ol>

        {loadingFrom ? (
          <Card className="p-8 text-center text-[14px] text-muted">Cargando evento a duplicar…</Card>
        ) : (
          <>
            {step === 0 && (
              <div className="flex flex-col gap-5">
                <div>
                  <h1 className="text-[24px] font-bold tracking-tight">¿Qué vamos a jugar?</h1>
                  <p className="mt-1 text-[14px] text-muted">Elegí un formato de base. Todo se puede ajustar después.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PRESETS.map((p) => {
                    const active = preset === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => choosePreset(p)}
                        className={cn(
                          'press focus-ring flex min-h-24 flex-col items-start gap-1 rounded-2xl border p-4 text-left',
                          active ? 'border-ink bg-ink text-white' : 'border-line bg-surface hover:bg-canvas',
                        )}
                      >
                        <span className="text-[16px] font-semibold">{PRESET_LABELS[p].title}</span>
                        <span className={cn('text-[12px] leading-snug', active ? 'text-white/70' : 'text-muted')}>{PRESET_LABELS[p].description}</span>
                        <span className={cn('mt-auto pt-2 text-[11px] font-semibold uppercase tracking-wider', active ? 'text-north' : 'text-muted-2')}>
                          {modeLabel(presetConfig(p).mode)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {preset === 'custom' && (
                  <Field label="Modo">
                    <Segmented
                      value={config.mode}
                      onChange={(mode) => setConfig((c) => ({ ...c, mode }))}
                      options={[
                        { value: 'rotating', label: 'Individual · rotativas' },
                        { value: 'fixed_pairs', label: 'Parejas fijas' },
                      ]}
                    />
                  </Field>
                )}
                <Card className="flex flex-col gap-4 p-5">
                  <Field label="Nombre del evento" error={form.formState.errors.name?.message}>
                    <Input {...form.register('name')} placeholder="Cancha Abierta — Viernes 21:00" />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Fecha y hora (opcional)">
                      <Input type="datetime-local" {...form.register('scheduledAt')} />
                    </Field>
                  </div>
                  <Field label="Descripción (opcional)">
                    <Textarea {...form.register('description')} className="min-h-20" placeholder="Notas para el club…" />
                  </Field>
                </Card>
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-5">
                <div>
                  <h1 className="text-[24px] font-bold tracking-tight">{isTeam ? 'Parejas' : 'Jugadores'}</h1>
                  <p className="mt-1 text-[14px] text-muted">
                    {isTeam ? 'Una pareja por línea: "Juan Pérez + Pedro García". Si pegás nombres sueltos, se arman de a dos.' : 'Pegá la lista, uno por línea. El nombre alcanza. Opcional: nivel 1-5 al final ("Juan Pérez, 4").'}
                  </p>
                </div>
                <Card className="p-4">
                  <Textarea
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                    placeholder={isTeam ? 'Juan Pérez + Pedro García\nMartín Gómez + Lucas Fernández' : 'Juan Pérez\nMartín Gómez, 3\nPedro García'}
                    className="min-h-32 font-mono text-[14px]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addFromPaste();
                    }}
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button onClick={addFromPaste} disabled={!paste.trim()}>
                      Agregar {paste.trim() ? (isTeam ? parseTeams(paste).length : parsePlayers(paste).length) : ''}
                    </Button>
                    <label className="press focus-ring inline-flex h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-4 text-[15px] font-medium hover:bg-canvas">
                      <Upload className="h-4 w-4" />
                      Importar CSV / TXT
                      <input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
                    </label>
                    <span className="ml-auto text-[13px] text-muted">
                      <b className="tabular text-ink">{count}</b> {isTeam ? 'parejas' : 'jugadores'}
                      {count < minCount && ` · mínimo ${minCount}`}
                    </span>
                  </div>
                </Card>

                {!isTeam && players.length > 0 && (
                  <Card className="divide-y divide-line-2">
                    {players.map((p, i) => (
                      <div key={p.key} className="flex items-center gap-2 px-3 py-1.5">
                        <span className="tabular w-6 text-[12px] text-muted">{i + 1}</span>
                        <Input
                          value={p.name}
                          onChange={(e) => setPlayers((prev) => prev.map((x) => (x.key === p.key ? { ...x, name: e.target.value } : x)))}
                          className="h-9 flex-1 border-transparent bg-transparent px-2 focus:border-line"
                        />
                        <NativeSelect
                          value={p.level ?? ''}
                          onChange={(e) => setPlayers((prev) => prev.map((x) => (x.key === p.key ? { ...x, level: e.target.value ? Number(e.target.value) : null } : x)))}
                          className="h-9 w-24 text-[13px]"
                        >
                          <option value="">Nivel</option>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              N{n}
                            </option>
                          ))}
                        </NativeSelect>
                        <button type="button" onClick={() => setPlayers((prev) => prev.filter((x) => x.key !== p.key))} className="press flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-canvas-2 hover:text-danger" aria-label="Quitar">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </Card>
                )}

                {isTeam && teams.length > 0 && (
                  <Card className="divide-y divide-line-2">
                    {teams.map((t, i) => (
                      <div key={t.key} className="flex items-center gap-2 px-3 py-1.5">
                        <span className="tabular w-6 text-[12px] text-muted">{i + 1}</span>
                        <Input value={t.a.name} placeholder="Jugador 1" onChange={(e) => setTeams((prev) => prev.map((x) => (x.key === t.key ? { ...x, a: { ...x.a, name: e.target.value } } : x)))} className="h-9 flex-1 border-transparent bg-transparent px-2 focus:border-line" />
                        <span className="text-muted-2">+</span>
                        <Input value={t.b.name} placeholder="Jugador 2" onChange={(e) => setTeams((prev) => prev.map((x) => (x.key === t.key ? { ...x, b: { ...x.b, name: e.target.value } } : x)))} className="h-9 flex-1 border-transparent bg-transparent px-2 focus:border-line" />
                        <button type="button" onClick={() => setTeams((prev) => prev.filter((x) => x.key !== t.key))} className="press flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-canvas-2 hover:text-danger" aria-label="Quitar">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </Card>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-5">
                <div>
                  <h1 className="text-[24px] font-bold tracking-tight">Canchas</h1>
                  <p className="mt-1 text-[14px] text-muted">Cuántas canchas hay disponibles esta noche. Podés renombrarlas.</p>
                </div>
                <Card className="flex flex-col gap-4 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-medium">Cantidad de canchas</span>
                    <Counter
                      value={courts.length}
                      min={1}
                      max={16}
                      onChange={(n) => setCourts((prev) => (n > prev.length ? [...prev, ...Array.from({ length: n - prev.length }, (_, i) => `Cancha ${prev.length + i + 1}`)] : prev.slice(0, n)))}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {courts.map((name, i) => (
                      <Input key={i} value={name} onChange={(e) => setCourts((prev) => prev.map((c, j) => (j === i ? e.target.value : c)))} />
                    ))}
                  </div>
                  <p className="text-[13px] text-muted">
                    Con <b className="tabular text-ink">{count}</b> {isTeam ? 'parejas' : 'jugadores'} y <b className="tabular text-ink">{courts.length}</b> canchas juegan{' '}
                    <b className="tabular text-ink">{Math.min(courts.length, Math.floor(count / (isTeam ? 2 : 4)))}</b> partidos a la vez
                    {!isTeam && ` (${Math.max(0, count - Math.min(courts.length, Math.floor(count / 4)) * 4)} esperan)`}.
                  </p>
                </Card>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-5">
                <div>
                  <h1 className="text-[24px] font-bold tracking-tight">Partido</h1>
                  <p className="mt-1 text-[14px] text-muted">Cómo se juega y se carga cada partido.</p>
                </div>
                <Card className="p-5">
                  <FormatForm value={config.format} onChange={(format) => setConfig((c) => ({ ...c, format }))} />
                </Card>
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-5">
                <div>
                  <h1 className="text-[24px] font-bold tracking-tight">Puntos y emparejamiento</h1>
                  <p className="mt-1 text-[14px] text-muted">Cómo se suman puntos, cómo se arman los partidos y cómo se desempata.</p>
                </div>
                <Card className="p-5">
                  <h2 className="mb-3 text-[15px] font-semibold">Sistema de puntos</h2>
                  <ScoringForm value={config.scoring} onChange={(scoring) => setConfig((c) => ({ ...c, scoring }))} format={config.format} />
                </Card>
                <Card className="p-5">
                  <h2 className="mb-3 text-[15px] font-semibold">Emparejamiento</h2>
                  <PairingForm value={config.pairing} onChange={(pairing) => setConfig((c) => ({ ...c, pairing }))} mode={config.mode} />
                </Card>
                <Card className="p-5">
                  <h2 className="mb-3 text-[15px] font-semibold">Desempates</h2>
                  <TiebreakersForm value={config.tiebreakers} onChange={(tiebreakers) => setConfig((c) => ({ ...c, tiebreakers }))} mode={config.mode} />
                </Card>
              </div>
            )}
          </>
        )}
      </div>

      {/* Barra de navegación del wizard */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line-2 bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="lg" onClick={() => (step === 0 ? navigate('/eventos') : setStep(step - 1))}>
            <ArrowLeft className="h-4 w-4" />
            {step === 0 ? 'Cancelar' : 'Atrás'}
          </Button>
          <div className="flex-1" />
          <Button size="lg" variant={step === STEPS.length - 1 ? 'north' : 'primary'} disabled={!canContinue || loadingFrom} loading={saving} onClick={goNext} className="min-w-40">
            {step === STEPS.length - 1 ? 'Crear torneo' : 'Continuar'}
            {step < STEPS.length - 1 && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
