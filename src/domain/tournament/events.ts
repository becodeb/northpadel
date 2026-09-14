import type {
  Availability,
  Court,
  CourtStatus,
  Match,
  MatchSide,
  Player,
  PointsAdjustment,
  SetScore,
  Team,
  TournamentConfig,
} from './types.js';

/**
 * Eventos = hechos ya ocurridos. Son la única fuente de verdad del torneo.
 * El estado se reconstruye reproduciéndolos en orden (ver reducer.ts).
 *
 * Los eventos NO contienen decisiones pendientes: si el motor armó un partido,
 * el evento trae el partido completo. Reproducir el log nunca vuelve a correr
 * el algoritmo, así que el historial es estable aunque el motor cambie.
 */
export type TournamentEvent =
  | {
      type: 'tournament_created';
      at: number;
      id: string;
      seed: string;
      config: TournamentConfig;
      players: Player[];
      teams: Team[];
      courts: Court[];
    }
  | { type: 'tournament_started'; at: number }
  | { type: 'tournament_finished'; at: number }
  | { type: 'tournament_reopened'; at: number }
  | { type: 'match_created'; at: number; match: Match }
  | { type: 'match_assigned'; at: number; matchId: string; courtId: string; start: boolean }
  | { type: 'match_started'; at: number; matchId: string }
  | { type: 'match_finished'; at: number; matchId: string; sets: SetScore[] }
  | { type: 'match_result_edited'; at: number; matchId: string; sets: SetScore[] }
  | { type: 'match_cancelled'; at: number; matchId: string; reason: string | null }
  | { type: 'match_lineup_changed'; at: number; matchId: string; sides: [MatchSide, MatchSide] }
  | { type: 'match_moved'; at: number; matchId: string; courtId: string | null; front: boolean }
  | { type: 'queue_reordered'; at: number; matchIds: string[] }
  | { type: 'player_added'; at: number; player: Player }
  | { type: 'player_updated'; at: number; playerId: string; name: string; level: number | null }
  | { type: 'player_removed'; at: number; playerId: string }
  | {
      type: 'player_availability_changed';
      at: number;
      playerId: string;
      availability: Availability;
      fairnessOffset: number;
    }
  | { type: 'team_added'; at: number; team: Team; players: Player[] }
  | { type: 'team_removed'; at: number; teamId: string }
  | { type: 'points_adjusted'; at: number; adjustment: PointsAdjustment }
  | { type: 'court_added'; at: number; court: Court }
  | { type: 'court_updated'; at: number; courtId: string; name: string }
  | { type: 'court_status_changed'; at: number; courtId: string; status: CourtStatus }
  | { type: 'config_updated'; at: number; config: TournamentConfig }
  | { type: 'auto_assign_changed'; at: number; enabled: boolean };

export type TournamentEventType = TournamentEvent['type'];

/** Evento tal como lo persiste el servidor: con metadatos de auditoría. */
export interface StoredEvent {
  seq: number;
  batchId: string;
  commandType: string;
  actorId: string | null;
  actorName: string | null;
  at: number;
  undone: boolean;
  event: TournamentEvent;
}
