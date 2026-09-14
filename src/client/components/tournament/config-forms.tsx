import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  ALL_TIEBREAKERS,
  STRATEGY_LABELS,
  TIEBREAKER_LABELS,
  type MatchFormat,
  type PairingRules,
  type PairingStrategy,
  type ScoringRules,
  type TiebreakCriterion,
  type TournamentConfig,
} from '@domain';
import { Field, Input, NativeSelect, Segmented, Switch } from '@/components/ui/primitives';
import { Counter } from '@/components/ui/stepper';
import { cn } from '@/lib/utils';

/**
 * Formularios de configuración compartidos por el wizard y por Configuración.
 * Controlados: reciben el valor y devuelven el valor nuevo completo.
 */

// ─── Formato de partido ─────────────────────────────────────────────────────

export function FormatForm({ value, onChange }: { value: MatchFormat; onChange: (v: MatchFormat) => void }) {
  const set = (patch: Partial<MatchFormat>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-5">
      <Field label="Cómo se cuenta el partido">
        <Segmented
          value={value.kind}
          onChange={(kind) => set({ kind, bestOf: kind === 'sets' ? (value.bestOf === 1 ? 3 : value.bestOf) : 1 })}
          options={[
            { value: 'games', label: '1 set' },
            { value: 'sets', label: 'Varios sets' },
            { value: 'points', label: 'Por puntos' },
          ]}
        />
      </Field>

      {value.kind === 'sets' && (
        <Field label="Sets al mejor de">
          <Segmented
            value={String(value.bestOf) as '1' | '3' | '5'}
            onChange={(v) => set({ bestOf: Number(v) as 1 | 3 | 5 })}
            options={[
              { value: '3', label: 'Mejor de 3' },
              { value: '5', label: 'Mejor de 5' },
            ]}
          />
        </Field>
      )}

      {value.kind !== 'points' ? (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Games por set">
            <Counter value={value.gamesPerSet} onChange={(v) => set({ gamesPerSet: v })} min={1} max={12} />
          </Field>
          <Field label="Partido por tiempo" hint="El marcador vale como quedó">
            <div className="flex items-center gap-2">
              <Switch checked={value.timed} onCheckedChange={(timed) => set({ timed, allowDraw: timed ? true : value.allowDraw })} />
              {value.timed && (
                <Input
                  type="number"
                  inputMode="numeric"
                  className="w-24"
                  placeholder="min"
                  value={value.timeMinutes ?? ''}
                  onChange={(e) => set({ timeMinutes: e.target.value ? Number(e.target.value) : null })}
                />
              )}
            </div>
          </Field>
        </div>
      ) : (
        <Field label="Puntos por partido" hint="Ej. Americano a 32 puntos: 20-12, 16-16…">
          <Counter value={value.targetPoints} onChange={(v) => set({ targetPoints: v })} min={4} max={200} step={4} />
        </Field>
      )}

      <div className="flex flex-col divide-y divide-line-2 rounded-2xl border border-line-2 px-4">
        {value.kind !== 'points' && (
          <Switch label="Tie-break" description="Permite 7-6 (con 6-6 se define por tie-break)" checked={value.tiebreak} onCheckedChange={(v) => set({ tiebreak: v })} />
        )}
        {value.kind === 'sets' && value.bestOf > 1 && (
          <Switch label="Super tie-break" description="El set decisivo se juega a 10 puntos" checked={value.superTiebreak} onCheckedChange={(v) => set({ superTiebreak: v })} />
        )}
        <Switch label="Permitir empate" description="Si no, hay que cargar un ganador" checked={value.allowDraw} onCheckedChange={(v) => set({ allowDraw: v })} />
        <Switch
          label="Validar marcadores"
          description={value.strict ? 'Rechaza resultados imposibles (ej. 8-6 con tie-break)' : 'Carga manual libre: acepta cualquier marcador'}
          checked={value.strict}
          onCheckedChange={(v) => set({ strict: v })}
        />
      </div>
    </div>
  );
}

// ─── Sistema de puntos ──────────────────────────────────────────────────────

const SCORING_PRESETS: { label: string; rules: Partial<ScoringRules> }[] = [
  { label: '3 · 1 · 0', rules: { win: 3, draw: 1, loss: 0, perGameWon: 0, perSetWon: 0, perGameDiff: 0, straightSetsBonus: 0 } },
  { label: '2 · 1 · 0', rules: { win: 2, draw: 1, loss: 0, perGameWon: 0, perSetWon: 0, perGameDiff: 0, straightSetsBonus: 0 } },
  { label: '2 · 1 · 1', rules: { win: 2, draw: 1, loss: 1, perGameWon: 0, perSetWon: 0, perGameDiff: 0, straightSetsBonus: 0 } },
  { label: 'Games jugados', rules: { win: 0, draw: 0, loss: 0, perGameWon: 1, perSetWon: 0, perGameDiff: 0, straightSetsBonus: 0 } },
];

function NumberField({ label, value, onChange, step = 1, hint }: { label: ReactNode; value: number; onChange: (v: number) => void; step?: number; hint?: ReactNode }) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        onFocus={(e) => e.currentTarget.select()}
        className="tabular"
      />
    </Field>
  );
}

export function ScoringForm({ value, onChange, format }: { value: ScoringRules; onChange: (v: ScoringRules) => void; format: MatchFormat }) {
  const set = (patch: Partial<ScoringRules>) => onChange({ ...value, ...patch });
  const isPreset = (p: Partial<ScoringRules>) => Object.entries(p).every(([k, v]) => value[k as keyof ScoringRules] === v);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {SCORING_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => set(p.rules)}
            className={cn(
              'press flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium',
              isPreset(p.rules) ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink hover:bg-canvas',
            )}
          >
            {isPreset(p.rules) && <Check className="h-3.5 w-3.5" />}
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <NumberField label="Victoria" value={value.win} onChange={(v) => set({ win: v })} />
        <NumberField label="Empate" value={value.draw} onChange={(v) => set({ draw: v })} />
        <NumberField label="Derrota" value={value.loss} onChange={(v) => set({ loss: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <NumberField label={format.kind === 'points' ? 'Por punto ganado' : 'Por game ganado'} value={value.perGameWon} onChange={(v) => set({ perGameWon: v })} step={0.5} />
        <NumberField label="Por game de diferencia" value={value.perGameDiff} onChange={(v) => set({ perGameDiff: v })} step={0.1} hint="Ej. 0.1 por game" />
        {format.kind === 'sets' && <NumberField label="Por set ganado" value={value.perSetWon} onChange={(v) => set({ perSetWon: v })} step={0.5} />}
        {format.kind === 'sets' && format.bestOf > 1 && (
          <NumberField label="Bonus sets corridos" value={value.straightSetsBonus} onChange={(v) => set({ straightSetsBonus: v })} step={0.5} hint="Ganar sin ceder set" />
        )}
        <NumberField label={format.kind === 'points' ? 'Por punto perdido' : 'Por game perdido'} value={value.perGameLost} onChange={(v) => set({ perGameLost: v })} step={0.5} hint="Negativo = penaliza" />
      </div>
    </div>
  );
}

// ─── Emparejamiento ─────────────────────────────────────────────────────────

const STRATEGIES: PairingStrategy[] = ['balanced', 'random', 'by_level', 'top_bottom', 'max_rotation', 'custom'];

export function PairingForm({ value, onChange, mode }: { value: PairingRules; onChange: (v: PairingRules) => void; mode: TournamentConfig['mode'] }) {
  const set = (patch: Partial<PairingRules>) => onChange({ ...value, ...patch });
  const setWeight = (k: keyof PairingRules['weights'], v: number) => set({ weights: { ...value.weights, [k]: v } });
  const strategies = mode === 'fixed_pairs' ? STRATEGIES.filter((s) => s !== 'top_bottom' && s !== 'max_rotation') : STRATEGIES;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-2 sm:grid-cols-2">
        {strategies.map((s) => {
          const active = value.strategy === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => set({ strategy: s })}
              className={cn(
                'press focus-ring flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left',
                active ? 'border-ink bg-ink text-white' : 'border-line bg-surface hover:bg-canvas',
              )}
            >
              <span className="text-[15px] font-semibold">{STRATEGY_LABELS[s].title}</span>
              <span className={cn('text-[12px] leading-snug', active ? 'text-white/70' : 'text-muted')}>{STRATEGY_LABELS[s].description}</span>
            </button>
          );
        })}
      </div>

      {value.strategy === 'custom' && (
        <div className="flex flex-col gap-3 rounded-2xl bg-canvas p-4">
          {(
            [
              ['matchBalance', 'Equilibrio de partidos jugados'],
              ['partnerRepeat', 'No repetir compañero'],
              ['opponentRepeat', 'No repetir rivales'],
              ['rest', 'Tiempo de descanso'],
              ['level', 'Nivel / ranking parejo'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="grid grid-cols-[1fr_auto] items-center gap-3 text-[14px]">
              <span className="flex items-center justify-between gap-2">
                {label}
                <span className="tabular text-[12px] text-muted">{value.weights[k]}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={value.weights[k]}
                onChange={(e) => setWeight(k, Number(e.target.value))}
                className="w-40 accent-ink"
              />
            </label>
          ))}
          <p className="text-[12px] text-muted">Los pesos son relativos entre sí.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Partidos seguidos permitidos" hint="Después de esto el motor prioriza que descanse">
          <Counter value={value.maxConsecutive} onChange={(v) => set({ maxConsecutive: v })} min={1} max={6} />
        </Field>
        <Field label="Fuerza de cada jugador">
          <NativeSelect value={value.strengthSource} onChange={(e) => set({ strengthSource: e.target.value as PairingRules['strengthSource'] })}>
            <option value="auto">Automático (nivel + ranking)</option>
            <option value="ranking">Solo ranking en vivo</option>
            <option value="level">Solo nivel declarado</option>
          </NativeSelect>
        </Field>
      </div>
      <div className="flex flex-col divide-y divide-line-2 rounded-2xl border border-line-2 px-4">
        <Switch label="Iniciar partidos automáticamente" description="Al asignar una cancha el partido arranca sin tocar nada" checked={value.autoStart} onCheckedChange={(v) => set({ autoStart: v })} />
        <div className="flex items-center justify-between gap-4 py-2.5">
          <span>
            <span className="block text-[15px] font-medium">Próximos a mostrar</span>
            <span className="block text-[13px] text-muted">Cuántos partidos anticipar en pantalla</span>
          </span>
          <NativeSelect value={value.previewCount == null ? 'auto' : String(value.previewCount)} onChange={(e) => set({ previewCount: e.target.value === 'auto' ? null : Number(e.target.value) })} className="w-32">
            <option value="auto">Automático</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
    </div>
  );
}

// ─── Desempates ─────────────────────────────────────────────────────────────

export function TiebreakersForm({ value, onChange, mode }: { value: TiebreakCriterion[]; onChange: (v: TiebreakCriterion[]) => void; mode: TournamentConfig['mode'] }) {
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = value.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const toggle = (c: TiebreakCriterion) => {
    if (value.includes(c)) {
      if (value.length > 1) onChange(value.filter((x) => x !== c));
    } else onChange([...value, c]);
  };
  const unused = ALL_TIEBREAKERS.filter((c) => !value.includes(c));
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-1.5">
        {value.map((c, i) => (
          <li key={c} className="flex items-center gap-2 rounded-xl border border-line bg-surface py-1.5 pl-3 pr-1.5">
            <span className="tabular w-5 text-[12px] font-semibold text-muted">{i + 1}</span>
            <span className="flex-1 text-[14px] font-medium">{TIEBREAKER_LABELS[c]}</span>
            {c === 'headToHead' && mode === 'rotating' && <span className="text-[11px] text-muted">solo si se enfrentaron</span>}
            <button type="button" className="press flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-canvas-2 hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">
              <ArrowUp className="h-4 w-4" />
            </button>
            <button type="button" className="press flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-canvas-2 hover:text-ink disabled:opacity-30" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="Bajar">
              <ArrowDown className="h-4 w-4" />
            </button>
            <button type="button" className="press h-8 rounded-lg px-2 text-[12px] text-muted hover:bg-canvas-2 hover:text-ink disabled:opacity-30" disabled={value.length === 1} onClick={() => toggle(c)}>
              Quitar
            </button>
          </li>
        ))}
      </ol>
      {unused.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unused.map((c) => (
            <button key={c} type="button" onClick={() => toggle(c)} className="press h-8 rounded-full border border-dashed border-line px-3 text-[12px] text-muted hover:border-ink hover:text-ink">
              + {TIEBREAKER_LABELS[c]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
