import type { CreateTournamentInput } from '../tournament/commands.js';
import { presetConfig } from '../tournament/config.js';

/** 28 jugadores ficticios para la demo "Cancha Abierta — North Padel". */
export const DEMO_PLAYERS: { name: string; level: number | null }[] = [
  { name: 'Juan Pérez', level: 4 },
  { name: 'Martín Gómez', level: 3 },
  { name: 'Pedro García', level: 3 },
  { name: 'Lucas Fernández', level: 5 },
  { name: 'Tomás López', level: 4 },
  { name: 'Franco Martínez', level: 2 },
  { name: 'Nico Rodríguez', level: 3 },
  { name: 'Bautista Sánchez', level: 4 },
  { name: 'Santiago Romero', level: 2 },
  { name: 'Mateo Díaz', level: 3 },
  { name: 'Joaquín Álvarez', level: 5 },
  { name: 'Facundo Torres', level: 3 },
  { name: 'Agustín Ruiz', level: 1 },
  { name: 'Gonzalo Ramírez', level: 4 },
  { name: 'Ezequiel Flores', level: 2 },
  { name: 'Ramiro Acosta', level: 3 },
  { name: 'Federico Benítez', level: 4 },
  { name: 'Ignacio Medina', level: 3 },
  { name: 'Manuel Herrera', level: 2 },
  { name: 'Julián Suárez', level: 5 },
  { name: 'Valentín Molina', level: 3 },
  { name: 'Lautaro Castro', level: 4 },
  { name: 'Matías Ortiz', level: 1 },
  { name: 'Sebastián Silva', level: 3 },
  { name: 'Emiliano Núñez', level: 2 },
  { name: 'Rodrigo Luna', level: 4 },
  { name: 'Nahuel Cabrera', level: 3 },
  { name: 'Andrés Ríos', level: 3 },
];

export function buildDemoInput(): CreateTournamentInput {
  const config = presetConfig('north_open');
  return {
    config: {
      ...config,
      name: 'Cancha Abierta — Demo',
      description: 'Torneo de demostración: 28 jugadores, 4 canchas, parejas rotativas equilibradas.',
    },
    players: DEMO_PLAYERS,
    courts: [{ name: 'Cancha 1' }, { name: 'Cancha 2' }, { name: 'Cancha 3' }, { name: 'Cancha 4' }],
  };
}
