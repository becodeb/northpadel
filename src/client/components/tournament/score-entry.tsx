import { useMemo, useState } from 'react';
import { evaluateSets, expectedSetCount, type MatchFormat, type MatchSide, type SetScore, type TournamentState } from '@domain';
import { Button } from '@/components/ui/button';
import { ScoreStepper } from '@/components/ui/stepper';
import { cn } from '@/lib/utils';
import { SideNames } from './names';

/**
 * Carga de resultado rapidísima: una fila por lado con stepper. Si el formato
 * es a varios sets, aparecen las filas necesarias (y una más cuando van 1-1).
 */
export function ScoreEntry({
  state,
  sides,
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Finalizar partido',
  loading,
}: {
  state: TournamentState;
  sides: [MatchSide, MatchSide];
  initial?: SetScore[] | null;
  onSubmit: (sets: SetScore[]) => void;
  onCancel?: () => void;
  submitLabel?: string;
  loading?: boolean;
}) {
  const format = state.config.format;
  const [sets, setSets] = useState<SetScore[]>(() => (initial && initial.length ? initial.map((s) => [s[0], s[1]]) : [[0, 0]]));

  const visibleCount = useMemo(() => expectedSetCount(format, sets.filter((s) => s[0] > 0 || s[1] > 0)), [format, sets]);
  const shown = useMemo(() => {
    const out = sets.slice(0, Math.max(visibleCount, 1));
    while (out.length < visibleCount) out.push([0, 0]);
    return out;
  }, [sets, visibleCount]);

  const update = (setIndex: number, side: 0 | 1, value: number) => {
    const next = shown.map((s) => [s[0], s[1]] as SetScore);
    while (next.length <= setIndex) next.push([0, 0]);
    next[setIndex][side] = value;
    setSets(next);
  };

  const filled = shown.filter((s) => s[0] > 0 || s[1] > 0);
  const outcome = evaluateSets(filled.length ? filled : shown, format);
  const canSubmit = outcome.valid;
  const winner = outcome.valid ? outcome.winner : null;

  return (
    <div className="flex flex-col gap-3">
      {shown.length > 1 && (
        <div className="grid grid-cols-[1fr_auto] items-center gap-x-3">
          <span />
          <div className="flex gap-1.5">
            {shown.map((_, i) => (
              <span key={i} className="eyebrow w-[152px] text-center">
                Set {i + 1}
              </span>
            ))}
          </div>
        </div>
      )}
      {([0, 1] as const).map((sideIndex) => (
        <div key={sideIndex} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto] sm:gap-x-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'h-2 w-2 shrink-0 rounded-full transition-colors',
                winner === sideIndex ? 'bg-north' : winner === null && outcome.valid ? 'bg-amber' : 'bg-line',
              )}
            />
            <SideNames side={sides[sideIndex]} state={state} size="md" className={cn(winner === sideIndex && 'text-ink')} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {shown.map((set, setIndex) => (
              <ScoreStepper
                key={setIndex}
                value={set[sideIndex]}
                onChange={(v) => update(setIndex, sideIndex, v)}
                max={format.kind === 'points' ? format.targetPoints : 99}
                label={`Set ${setIndex + 1}, lado ${sideIndex + 1}`}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-2">
        {onCancel && (
          <Button variant="ghost" size="lg" onClick={onCancel} className="px-3">
            Cancelar
          </Button>
        )}
        <Button
          size="lg"
          variant={canSubmit ? 'primary' : 'secondary'}
          className="min-w-0 flex-1"
          disabled={!canSubmit}
          loading={loading}
          onClick={() => onSubmit(filled.length ? filled : shown)}
        >
          {submitLabel}
        </Button>
      </div>
      {!outcome.valid && outcome.error && filled.length > 0 && (
        <p className="text-center text-[13px] text-magenta-ink">{outcome.error}</p>
      )}
      {format.kind === 'points' && (
        <p className="text-center text-[12px] text-muted">Partido a {format.targetPoints} puntos</p>
      )}
    </div>
  );
}

export function formatLabel(format: MatchFormat): string {
  if (format.kind === 'points') return `a ${format.targetPoints} pts`;
  if (format.kind === 'sets' && format.bestOf > 1) return `mejor de ${format.bestOf}`;
  return `1 set a ${format.gamesPerSet}`;
}
