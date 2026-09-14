import { z } from 'zod';
import { tournamentConfigSchema } from './config.js';

/**
 * Comandos = intenciones del organizador. Se validan con Zod tanto en el
 * cliente (feedback inmediato) como en el servidor (seguridad).
 */

const id = z.string().min(1).max(64);
const setScore = z.tuple([z.number().int().min(0).max(99), z.number().int().min(0).max(99)]);
const sets = z.array(setScore).min(1).max(5);

export const playerInputSchema = z.object({
  name: z.string().trim().min(1, 'Nombre vacío').max(60),
  level: z.number().int().min(1).max(5).nullable().optional(),
});

export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start_tournament') }),
  z.object({ type: z.literal('finish_tournament') }),
  z.object({ type: z.literal('reopen_tournament') }),
  z.object({ type: z.literal('record_result'), matchId: id, sets }),
  z.object({ type: z.literal('edit_result'), matchId: id, sets }),
  z.object({ type: z.literal('start_match'), matchId: id }),
  z.object({ type: z.literal('cancel_match'), matchId: id, reason: z.string().max(200).optional() }),
  z.object({ type: z.literal('regenerate_match'), matchId: id }),
  z.object({ type: z.literal('swap_player'), matchId: id, outId: id, inId: id }),
  z.object({ type: z.literal('rotate_pairs'), matchId: id }),
  z.object({ type: z.literal('swap_sides'), matchId: id }),
  z.object({ type: z.literal('move_match'), matchId: id, courtId: id.nullable() }),
  z.object({
    type: z.literal('create_match'),
    sides: z.tuple([z.array(id).min(1).max(2), z.array(id).min(1).max(2)]),
    courtId: id.nullable(),
  }),
  z.object({ type: z.literal('reorder_queue'), matchIds: z.array(id) }),
  z.object({ type: z.literal('add_player'), name: playerInputSchema.shape.name, level: playerInputSchema.shape.level }),
  z.object({
    type: z.literal('add_team'),
    players: z.tuple([playerInputSchema, playerInputSchema]),
    name: z.string().trim().max(60).nullable().optional(),
  }),
  z.object({
    type: z.literal('update_player'),
    playerId: id,
    name: playerInputSchema.shape.name,
    level: z.number().int().min(1).max(5).nullable(),
  }),
  z.object({ type: z.literal('remove_player'), playerId: id }),
  z.object({ type: z.literal('remove_team'), teamId: id }),
  z.object({
    type: z.literal('set_availability'),
    playerId: id,
    availability: z.enum(['active', 'paused', 'absent']),
  }),
  z.object({
    type: z.literal('adjust_points'),
    targetId: id,
    delta: z.number().min(-1000).max(1000),
    reason: z.string().trim().min(1).max(120),
  }),
  z.object({ type: z.literal('add_court'), name: z.string().trim().max(40).optional() }),
  z.object({ type: z.literal('rename_court'), courtId: id, name: z.string().trim().min(1).max(40) }),
  z.object({
    type: z.literal('set_court_status'),
    courtId: id,
    status: z.enum(['available', 'occupied', 'out_of_service']),
  }),
  z.object({ type: z.literal('update_config'), config: tournamentConfigSchema }),
  z.object({ type: z.literal('set_auto_assign'), enabled: z.boolean() }),
]);

export type Command = z.infer<typeof commandSchema>;
export type CommandType = Command['type'];
export type PlayerInput = z.infer<typeof playerInputSchema>;

export const COMMAND_LABELS: Record<CommandType, string> = {
  start_tournament: 'Comenzó el torneo',
  finish_tournament: 'Finalizó el torneo',
  reopen_tournament: 'Reabrió el torneo',
  record_result: 'Cargó resultado',
  edit_result: 'Editó resultado',
  start_match: 'Inició partido',
  cancel_match: 'Canceló partido',
  regenerate_match: 'Rehizo partido',
  swap_player: 'Cambió jugador',
  rotate_pairs: 'Cambió parejas',
  swap_sides: 'Intercambió lados',
  move_match: 'Movió partido',
  create_match: 'Creó partido manual',
  reorder_queue: 'Reordenó próximos',
  add_player: 'Agregó jugador',
  add_team: 'Agregó pareja',
  update_player: 'Editó jugador',
  remove_player: 'Quitó jugador',
  remove_team: 'Quitó pareja',
  set_availability: 'Cambió estado de jugador',
  adjust_points: 'Ajustó puntos',
  add_court: 'Agregó cancha',
  rename_court: 'Renombró cancha',
  set_court_status: 'Cambió estado de cancha',
  update_config: 'Cambió configuración',
  set_auto_assign: 'Cambió asignación automática',
};

/** Payload para crear un torneo (wizard). */
export const createTournamentSchema = z.object({
  config: tournamentConfigSchema,
  players: z.array(playerInputSchema).max(200),
  /** Parejas fijas: índices de players que forman cada pareja. */
  teams: z
    .array(
      z.object({
        playerIndexes: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
        name: z.string().trim().max(60).nullable().optional(),
      }),
    )
    .optional(),
  courts: z.array(z.object({ name: z.string().trim().min(1).max(40) })).min(1).max(20),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
