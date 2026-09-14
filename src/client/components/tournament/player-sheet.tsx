import { useEffect, useState } from 'react';
import { competitorName, restMs, STATUS_LABELS, type Availability } from '@domain';
import { Button } from '@/components/ui/button';
import { Field, Input, Modal, NativeSelect } from '@/components/ui/primitives';
import { playerStatus } from '@/lib/derived';
import { formatMinutes, formatPoints, formatRelative, signed } from '@/lib/format-extra';
import { cn } from '@/lib/utils';
import { useEvent } from '@/pages/event/event-context';
import { StatusDot } from './waiting-list';

const LEVELS = [
  { value: '', label: 'Sin nivel' },
  { value: '1', label: '1 · Inicial' },
  { value: '2', label: '2 · Principiante' },
  { value: '3', label: '3 · Intermedio' },
  { value: '4', label: '4 · Avanzado' },
  { value: '5', label: '5 · Competitivo' },
];

/** Ficha del jugador dentro del evento: ranking, estado, historial, ajustes. */
export function PlayerSheet({ playerId, onClose }: { playerId: string | null; onClose: () => void }) {
  const { state, derived, now, run, readOnly } = useEvent();
  const player = playerId ? state.players.find((p) => p.id === playerId) : null;
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');
  const [adjust, setAdjust] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (player) {
      setName(player.name);
      setLevel(player.level ? String(player.level) : '');
      setAdjust('');
      setReason('');
    }
  }, [player?.id, player?.name, player?.level]);

  if (!player) return <Modal open={false} onOpenChange={onClose} title="" />;

  const competitorId = state.config.mode === 'fixed_pairs' ? (player.teamId ?? player.id) : player.id;
  const s = derived.stats.byId[competitorId];
  const rank = derived.rankOf[competitorId];
  const status = playerStatus(state, derived, player, now);
  const rest = s ? restMs(state, s, now) : 0;
  const partners = Object.entries(s?.partners ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const opponents = Object.entries(s?.opponents ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const isTeamMode = state.config.mode === 'fixed_pairs';

  const saveIdentity = () => {
    if (name.trim() !== player.name || (level ? Number(level) : null) !== player.level) {
      run({ type: 'update_player', playerId: player.id, name: name.trim(), level: level ? Number(level) : null });
    }
  };

  return (
    <Modal
      open={!!playerId}
      onOpenChange={(o) => !o && onClose()}
      title={
        <span className="flex items-center gap-2">
          <StatusDot status={status} />
          {player.name}
        </span>
      }
      description={`${STATUS_LABELS[status]}${s?.lastMatchEndedAt ? ` · último partido ${formatRelative(now - s.lastMatchEndedAt)}` : status === 'available' ? ` · esperando ${formatMinutes(rest)}` : ''}`}
      size="md"
    >
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Ranking" value={rank ? `#${rank}` : '—'} />
        <Stat label="Puntos" value={formatPoints(s?.points ?? 0)} />
        <Stat label="Partidos" value={String(s?.matchesPlayed ?? 0)} />
        <Stat label="Dif. games" value={signed(s?.gameDiff ?? 0)} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat label="Victorias" value={String(s?.wins ?? 0)} tone="north" />
        <Stat label="Empates" value={String(s?.draws ?? 0)} />
        <Stat label="Derrotas" value={String(s?.losses ?? 0)} tone="magenta" />
      </div>

      {!readOnly && (
        <div className="mt-5 flex flex-col gap-3">
          <Field label="Estado">
            <NativeSelect
              value={player.availability}
              onChange={(e) => run({ type: 'set_availability', playerId: player.id, availability: e.target.value as Availability })}
            >
              <option value="active">Disponible</option>
              <option value="paused">Pausado (vuelve más tarde)</option>
              <option value="absent">Ausente (se fue)</option>
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Field label="Nombre">
              <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveIdentity} />
            </Field>
            <Field label="Nivel">
              <NativeSelect
                value={level}
                onChange={(e) => {
                  setLevel(e.target.value);
                  run({ type: 'update_player', playerId: player.id, name: name.trim() || player.name, level: e.target.value ? Number(e.target.value) : null });
                }}
                className="w-40"
              >
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </div>
      )}

      {s && s.history.length > 0 && (
        <div className="mt-5">
          <h3 className="eyebrow mb-2">Últimos partidos</h3>
          <ul className="divide-y divide-line-2 rounded-2xl border border-line-2">
            {s.history
              .slice()
              .reverse()
              .slice(0, 8)
              .map((h) => (
                <li key={h.matchId} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <span
                    className={cn(
                      'w-1.5 self-stretch rounded-full',
                      h.outcome === 'win' ? 'bg-north' : h.outcome === 'draw' ? 'bg-amber' : 'bg-magenta/60',
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {!isTeamMode && h.partnerIds.length > 0 && (
                      <span className="text-muted">con {h.partnerIds.map((id) => competitorName(state, id)).join(' + ')} · </span>
                    )}
                    vs {h.opponentIds.map((id) => competitorName(state, id)).join(' + ')}
                  </span>
                  <span className="tabular shrink-0 font-semibold">{h.scoreFor.map(([a, b]) => `${a}-${b}`).join(' ')}</span>
                  <span className="tabular w-10 shrink-0 text-right text-muted">{signed(h.pointsEarned)}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {(partners.length > 0 || opponents.length > 0) && (
        <div className="mt-5 grid grid-cols-2 gap-4 text-[13px]">
          {!isTeamMode && (
            <div>
              <h3 className="eyebrow mb-2">Compañeros</h3>
              <ul className="flex flex-col gap-1">
                {partners.map(([id, n]) => (
                  <li key={id} className="flex justify-between gap-2">
                    <span className="truncate">{competitorName(state, id)}</span>
                    <span className="tabular text-muted">×{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="eyebrow mb-2">Rivales</h3>
            <ul className="flex flex-col gap-1">
              {opponents.map(([id, n]) => (
                <li key={id} className="flex justify-between gap-2">
                  <span className="truncate">{competitorName(state, id)}</span>
                  <span className="tabular text-muted">×{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="mt-6 rounded-2xl bg-canvas p-3">
          <h3 className="eyebrow mb-2">Ajustar puntos</h3>
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="decimal"
              step="0.5"
              placeholder="+/-"
              value={adjust}
              onChange={(e) => setAdjust(e.target.value)}
              className="w-24"
            />
            <Input placeholder="Motivo (ej. llegó tarde)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button
              variant="outline"
              disabled={!adjust || !reason.trim() || Number.isNaN(Number(adjust))}
              onClick={() => {
                if (run({ type: 'adjust_points', targetId: competitorId, delta: Number(adjust), reason: reason.trim() })) {
                  setAdjust('');
                  setReason('');
                }
              }}
            >
              Aplicar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'north' | 'magenta' }) {
  return (
    <div className="rounded-2xl bg-canvas px-3 py-2.5">
      <div className="eyebrow">{label}</div>
      <div className={cn('tabular mt-0.5 text-[20px] font-bold', tone === 'north' && 'text-north-ink', tone === 'magenta' && 'text-magenta-ink')}>{value}</div>
    </div>
  );
}
