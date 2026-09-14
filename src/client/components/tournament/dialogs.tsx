import { useEffect, useMemo, useState } from 'react';
import type { Match, SetScore } from '@domain';
import { restMs } from '@domain';
import { Button } from '@/components/ui/button';
import { Badge, Field, Input, Modal, NativeSelect } from '@/components/ui/primitives';
import { playerStatus } from '@/lib/derived';
import { formatMinutes } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useEvent } from '@/pages/event/event-context';
import { ScoreEntry } from './score-entry';

// ─── Cambiar jugador ────────────────────────────────────────────────────────

export function SwapPlayerDialog({ open, onOpenChange, match }: { open: boolean; onOpenChange: (o: boolean) => void; match: Match }) {
  const { state, derived, now, run } = useEvent();
  const isTeam = state.config.mode === 'fixed_pairs';
  const [outId, setOutId] = useState<string>('');
  const [inId, setInId] = useState<string>('');

  const inMatch = isTeam
    ? match.sides.map((s) => s.teamId!).filter(Boolean)
    : match.sides.flatMap((s) => s.playerIds);

  const available = useMemo(() => {
    if (isTeam) {
      return state.teams
        .filter((t) => !inMatch.includes(t.id))
        .map((t) => ({ id: t.id, name: derived.stats.byId[t.id]?.name ?? '?', busy: !!derived.stats.byId[t.id]?.currentMatchId, rest: 0 }))
        .filter((t) => !t.busy);
    }
    return state.players
      .filter((p) => !inMatch.includes(p.id))
      .map((p) => {
        const s = derived.stats.byId[p.id];
        return { id: p.id, name: p.name, status: playerStatus(state, derived, p, now), rest: s ? restMs(state, s, now) : 0, pj: s?.matchesPlayed ?? 0 };
      })
      .filter((p) => p.status === 'available' || p.status === 'resting' || p.status === 'next')
      .sort((a, b) => a.pj - b.pj || b.rest - a.rest);
  }, [state, derived, now, inMatch, isTeam]);

  useEffect(() => {
    if (open) {
      setOutId(inMatch[0] ?? '');
      setInId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const nameOf = (id: string) => (isTeam ? derived.stats.byId[id]?.name : state.players.find((p) => p.id === id)?.name) ?? '?';

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Cambiar jugador"
      description="Elegí quién sale y quién entra. El resto del partido queda igual."
      size="sm"
      footer={
        <Button
          size="lg"
          block
          disabled={!outId || !inId}
          onClick={() => {
            if (run({ type: 'swap_player', matchId: match.id, outId, inId })) onOpenChange(false);
          }}
        >
          Confirmar cambio
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Sale">
          <div className="grid grid-cols-2 gap-2">
            {inMatch.map((id) => (
              <ChoiceChip key={id} active={outId === id} onClick={() => setOutId(id)}>
                {nameOf(id)}
              </ChoiceChip>
            ))}
          </div>
        </Field>
        <Field label="Entra">
          {available.length === 0 ? (
            <p className="text-[13px] text-muted">No hay jugadores disponibles ahora.</p>
          ) : (
            <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
              {available.map((p) => (
                <ChoiceChip key={p.id} active={inId === p.id} onClick={() => setInId(p.id)} className="justify-between">
                  <span className="truncate">{p.name}</span>
                  {'pj' in p && (
                    <span className="tabular shrink-0 text-[12px] text-muted">
                      {p.pj} PJ · {formatMinutes(p.rest)}
                    </span>
                  )}
                </ChoiceChip>
              ))}
            </div>
          )}
        </Field>
      </div>
    </Modal>
  );
}

export function ChoiceChip({ active, onClick, children, className, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'press focus-ring flex h-11 items-center gap-2 rounded-xl border px-3 text-left text-[14px] font-medium disabled:opacity-40',
        active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink hover:bg-canvas',
        className,
      )}
    >
      {children}
    </button>
  );
}

// ─── Partido manual ─────────────────────────────────────────────────────────

export function CreateMatchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { state, derived, now, run } = useEvent();
  const isTeam = state.config.mode === 'fixed_pairs';
  const perSide = isTeam ? 1 : 2;
  const [picked, setPicked] = useState<string[]>([]);
  const [courtId, setCourtId] = useState<string>('');

  useEffect(() => {
    if (open) {
      setPicked([]);
      setCourtId(state.courts.find((c) => derived.freeCourtIds.has(c.id))?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const candidates = useMemo(() => {
    if (isTeam) {
      return state.teams
        .map((t) => ({ id: t.id, name: derived.stats.byId[t.id]?.name ?? '?', s: derived.stats.byId[t.id] }))
        .filter((t) => t.s && !t.s.currentMatchId)
        .map((t) => ({ id: t.id, name: t.name, pj: t.s!.matchesPlayed, rest: restMs(state, t.s!, now), queued: !!t.s!.queuedMatchId }));
    }
    return state.players
      .map((p) => ({ p, s: derived.stats.byId[p.id], status: playerStatus(state, derived, p, now) }))
      .filter((x) => x.status !== 'playing' && x.status !== 'paused' && x.status !== 'absent')
      .map((x) => ({ id: x.p.id, name: x.p.name, pj: x.s?.matchesPlayed ?? 0, rest: x.s ? restMs(state, x.s, now) : 0, queued: x.status === 'next' }))
      .sort((a, b) => a.pj - b.pj || b.rest - a.rest);
  }, [state, derived, now, isTeam]);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < perSide * 2 ? [...prev, id] : prev));

  const sides: [string[], string[]] = [picked.slice(0, perSide), picked.slice(perSide, perSide * 2)];
  const ready = picked.length === perSide * 2;
  const free = state.courts.filter((c) => derived.freeCourtIds.has(c.id));

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Partido manual"
      description={isTeam ? 'Elegí 2 parejas: la primera contra la segunda.' : 'Tocá 4 jugadores en orden: los dos primeros juegan juntos.'}
      size="md"
      footer={
        <Button
          size="lg"
          block
          disabled={!ready}
          onClick={() => {
            if (run({ type: 'create_match', sides, courtId: courtId || null })) onOpenChange(false);
          }}
        >
          {courtId ? 'Crear y jugar ahora' : 'Agregar a próximos'}
        </Button>
      }
    >
      <div className="mb-3 rounded-2xl bg-canvas p-3 text-[14px]">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="font-semibold">{sides[0].map((id) => candidates.find((c) => c.id === id)?.name).join(' + ') || '…'}</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">vs</span>
          <span className="font-semibold">{sides[1].map((id) => candidates.find((c) => c.id === id)?.name).join(' + ') || '…'}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {candidates.map((c) => {
          const index = picked.indexOf(c.id);
          return (
            <ChoiceChip key={c.id} active={index >= 0} onClick={() => toggle(c.id)} className="justify-between">
              <span className="flex min-w-0 items-center gap-2">
                {index >= 0 && <span className="tabular flex h-5 w-5 items-center justify-center rounded-md bg-white/20 text-[11px]">{index + 1}</span>}
                <span className="truncate">{c.name}</span>
              </span>
              <span className={cn('tabular shrink-0 text-[11px]', index >= 0 ? 'text-white/70' : 'text-muted')}>
                {c.pj} PJ{c.queued ? ' · próx.' : ''}
              </span>
            </ChoiceChip>
          );
        })}
      </div>
      <Field label="Dónde" className="mt-4">
        <NativeSelect value={courtId} onChange={(e) => setCourtId(e.target.value)}>
          <option value="">Agregar a próximos (con prioridad)</option>
          {free.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (libre)
            </option>
          ))}
        </NativeSelect>
      </Field>
    </Modal>
  );
}

// ─── Editar resultado ───────────────────────────────────────────────────────

export function EditResultDialog({ match, onClose }: { match: Match | null; onClose: () => void }) {
  const { state, run } = useEvent();
  if (!match) return <Modal open={false} onOpenChange={onClose} title="" />;
  return (
    <Modal open={!!match} onOpenChange={(o) => !o && onClose()} title="Editar resultado" description="El ranking se recalcula al instante." size="md">
      <ScoreEntry
        key={match.id}
        state={state}
        sides={match.sides}
        initial={match.sets}
        submitLabel="Guardar resultado"
        onCancel={onClose}
        onSubmit={(sets: SetScore[]) => {
          if (run({ type: 'edit_result', matchId: match.id, sets })) onClose();
        }}
      />
    </Modal>
  );
}

// ─── Agregar jugador / pareja ───────────────────────────────────────────────

export function AddPlayerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { state, run } = useEvent();
  const isTeam = state.config.mode === 'fixed_pairs';
  const [name, setName] = useState('');
  const [name2, setName2] = useState('');
  const [level, setLevel] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setName2('');
      setLevel('');
    }
  }, [open]);

  const submit = () => {
    const ok = isTeam
      ? run({ type: 'add_team', players: [{ name: name.trim(), level: level ? Number(level) : null }, { name: name2.trim(), level: level ? Number(level) : null }] })
      : run({ type: 'add_player', name: name.trim(), level: level ? Number(level) : null });
    if (ok) onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isTeam ? 'Agregar pareja' : 'Agregar jugador'}
      description={state.status === 'live' ? 'Entra con prioridad: arranca al nivel de partidos del que menos jugó.' : undefined}
      size="sm"
      footer={
        <Button size="lg" block disabled={!name.trim() || (isTeam && !name2.trim())} onClick={submit}>
          Agregar
        </Button>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && (!isTeam || name2.trim())) submit();
        }}
      >
        <Field label={isTeam ? 'Jugador 1' : 'Nombre'}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
        </Field>
        {isTeam && (
          <Field label="Jugador 2">
            <Input value={name2} onChange={(e) => setName2(e.target.value)} placeholder="Nombre y apellido" />
          </Field>
        )}
        <Field label="Nivel (opcional)">
          <NativeSelect value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Sin nivel</option>
            <option value="1">1 · Inicial</option>
            <option value="2">2 · Principiante</option>
            <option value="3">3 · Intermedio</option>
            <option value="4">4 · Avanzado</option>
            <option value="5">5 · Competitivo</option>
          </NativeSelect>
        </Field>
        <button type="submit" className="hidden" />
      </form>
      {state.status === 'live' && <Badge tone="north" className="mt-3">Se suma al torneo en curso</Badge>}
    </Modal>
  );
}
