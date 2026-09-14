import { TIEBREAKER_LABELS } from '@domain';
import { RankingTable } from '@/components/tournament/ranking-table';
import { useEvent } from './event-context';

export function EventRankingPage() {
  const { state } = useEvent();
  return (
    <div className="flex flex-col gap-3">
      <RankingTable />
      <p className="px-1 text-[12px] text-muted">
        Desempates: {state.config.tiebreakers.map((t) => TIEBREAKER_LABELS[t]).join(' → ')}
      </p>
    </div>
  );
}
