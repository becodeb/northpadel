import { formatScore } from '../scoring/scoring-engine.js';
import type { StoredEvent, TournamentEvent } from './events.js';
import { competitorName, playerName } from './stats.js';
import type { TournamentState } from './types.js';

/**
 * Descripciones legibles del historial de cambios ("21:34 Martín cargó resultado…").
 * Se calculan con el estado actual para resolver nombres.
 */

function sideLabel(state: TournamentState, side: { playerIds: string[]; teamId: string | null }): string {
  if (state.config.mode === 'fixed_pairs' && side.teamId) return competitorName(state, side.teamId);
  return side.playerIds.map((id) => playerName(state, id)).join(' + ');
}

function matchLabel(state: TournamentState, matchId: string): string {
  const m = state.matches.find((x) => x.id === matchId);
  if (!m) return 'partido';
  return `${sideLabel(state, m.sides[0])} vs ${sideLabel(state, m.sides[1])}`;
}

function courtLabel(state: TournamentState, courtId: string | null): string {
  if (!courtId) return 'la cola';
  return state.courts.find((c) => c.id === courtId)?.name ?? 'cancha';
}

export function describeEvent(state: TournamentState, event: TournamentEvent): string | null {
  switch (event.type) {
    case 'tournament_created':
      return 'Torneo creado';
    case 'tournament_started':
      return 'Comenzó el torneo';
    case 'tournament_finished':
      return 'Torneo finalizado';
    case 'tournament_reopened':
      return 'Torneo reabierto';
    case 'match_created':
      return event.match.courtId
        ? `${courtLabel(state, event.match.courtId)}: ${matchLabel(state, event.match.id)}`
        : `Próximo: ${matchLabel(state, event.match.id)}`;
    case 'match_assigned':
      return `${courtLabel(state, event.courtId)}: ${matchLabel(state, event.matchId)}`;
    case 'match_started':
      return `Inició ${matchLabel(state, event.matchId)}`;
    case 'match_finished': {
      const m = state.matches.find((x) => x.id === event.matchId);
      return `${courtLabel(state, m?.courtId ?? null)} — ${formatScore(event.sets)} · ${matchLabel(state, event.matchId)}`;
    }
    case 'match_result_edited':
      return `Resultado editado: ${formatScore(event.sets)} · ${matchLabel(state, event.matchId)}`;
    case 'match_cancelled':
      return `Cancelado: ${matchLabel(state, event.matchId)}${event.reason ? ` (${event.reason})` : ''}`;
    case 'match_lineup_changed':
      return `Alineación: ${sideLabel(state, event.sides[0])} vs ${sideLabel(state, event.sides[1])}`;
    case 'match_moved':
      return `${matchLabel(state, event.matchId)} → ${courtLabel(state, event.courtId)}`;
    case 'queue_reordered':
      return 'Próximos reordenados';
    case 'player_added':
      return `${event.player.name} se sumó`;
    case 'player_updated':
      return `${event.name} editado`;
    case 'player_removed':
      return 'Jugador quitado';
    case 'player_availability_changed': {
      const name = playerName(state, event.playerId);
      const label =
        event.availability === 'active' ? 'vuelve a estar disponible' : event.availability === 'paused' ? 'en pausa' : 'ausente';
      return `${name} ${label}`;
    }
    case 'team_added':
      return `Pareja ${competitorName(state, event.team.id)} agregada`;
    case 'team_removed':
      return 'Pareja quitada';
    case 'points_adjusted':
      return `${competitorName(state, event.adjustment.targetId)}: ${event.adjustment.delta > 0 ? '+' : ''}${event.adjustment.delta} pts (${event.adjustment.reason})`;
    case 'court_added':
      return `${event.court.name} agregada`;
    case 'court_updated':
      return `Cancha renombrada: ${event.name}`;
    case 'court_status_changed': {
      const label =
        event.status === 'available' ? 'disponible' : event.status === 'occupied' ? 'ocupada' : 'fuera de servicio';
      return `${courtLabel(state, event.courtId)} ${label}`;
    }
    case 'config_updated':
      return 'Configuración actualizada';
    case 'auto_assign_changed':
      return event.enabled ? 'Asignación automática activada' : 'Asignación automática pausada';
    default:
      return null;
  }
}

export interface ActivityEntry {
  batchId: string;
  at: number;
  actorName: string | null;
  commandType: string;
  lines: string[];
  undone: boolean;
  /** Solo el último lote no deshecho se puede deshacer. */
  canUndo: boolean;
}

/** Agrupa eventos por lote (comando) para mostrar el historial. */
export function buildActivity(state: TournamentState, events: StoredEvent[]): ActivityEntry[] {
  const batches = new Map<string, ActivityEntry>();
  for (const e of events) {
    if (e.event.type === 'tournament_created') continue;
    let entry = batches.get(e.batchId);
    if (!entry) {
      entry = { batchId: e.batchId, at: e.at, actorName: e.actorName, commandType: e.commandType, lines: [], undone: e.undone, canUndo: false };
      batches.set(e.batchId, entry);
    }
    const line = describeEvent(state, e.event);
    if (line) entry.lines.push(line);
  }
  const list = Array.from(batches.values()).sort((a, b) => b.at - a.at);
  const lastLive = list.find((b) => !b.undone);
  if (lastLive && lastLive.commandType !== 'start_tournament') lastLive.canUndo = true;
  return list;
}
