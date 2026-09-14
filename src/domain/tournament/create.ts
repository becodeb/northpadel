import { createRng, deterministicId } from '../shared/rng.js';
import { DomainError } from '../shared/errors.js';
import type { CreateTournamentInput } from './commands.js';
import type { TournamentEvent } from './events.js';
import type { Court, Player, Team } from './types.js';

export interface CreateContext {
  now: number;
  id: string;
  seed: string;
}

/** Construye el evento inicial del torneo a partir del payload del wizard. */
export function createTournamentEvent(
  input: CreateTournamentInput,
  ctx: CreateContext,
): Extract<TournamentEvent, { type: 'tournament_created' }> {
  const rng = createRng(`${ctx.seed}:create`);
  const players: Player[] = input.players.map((p) => ({
    id: deterministicId(rng, 'p'),
    name: p.name.trim(),
    level: p.level ?? null,
    availability: 'active',
    joinedAt: ctx.now,
    fairnessOffset: 0,
    teamId: null,
  }));

  const names = new Set<string>();
  for (const p of players) {
    const key = p.name.toLocaleLowerCase('es');
    if (names.has(key)) throw new DomainError('duplicate_name', `Hay dos jugadores llamados "${p.name}".`);
    names.add(key);
  }

  const teams: Team[] = [];
  if (input.config.mode === 'fixed_pairs') {
    const used = new Set<number>();
    for (const t of input.teams ?? []) {
      const [a, b] = t.playerIndexes;
      if (a === b || used.has(a) || used.has(b) || !players[a] || !players[b]) {
        throw new DomainError('invalid_team', 'Cada jugador puede estar en una sola pareja.');
      }
      used.add(a);
      used.add(b);
      const team: Team = {
        id: deterministicId(rng, 't'),
        name: t.name?.trim() || null,
        playerIds: [players[a].id, players[b].id],
      };
      players[a].teamId = team.id;
      players[b].teamId = team.id;
      teams.push(team);
    }
    const loose = players.filter((p) => !p.teamId);
    if (loose.length) {
      throw new DomainError('player_without_team', `${loose[0].name} no tiene pareja asignada.`);
    }
  }

  const courts: Court[] = input.courts.map((c, i) => ({
    id: deterministicId(rng, 'c'),
    name: c.name.trim() || `Cancha ${i + 1}`,
    status: 'available',
    order: i + 1,
  }));

  return {
    type: 'tournament_created',
    at: ctx.now,
    id: ctx.id,
    seed: ctx.seed,
    config: input.config,
    players,
    teams,
    courts,
  };
}
