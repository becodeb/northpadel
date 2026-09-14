# Arquitectura — North Padel

Sistema operativo para "Cancha Abierta" y torneos dinámicos de pádel. Pensado para
usarse en vivo, desde un teléfono, mientras el torneo ocurre.

```
src/
  domain/        lógica pura (sin React, sin Node). Se comparte entre cliente y servidor.
    tournament/  tipos, configuración/presets, comandos (Zod), eventos, reducer, decide, stats
    scoring/     ScoringEngine: marcador → resultado → puntos
    ranking/     RankingEngine: desempates configurables, enfrentamiento directo
    pairing/     PairingEngine: función de costo y estrategias; fuerza de cada jugador
    scheduling/  SchedulingEngine: canchas libres, proyección de próximos, cola manual
    fairness/    FairnessEngine: métricas y avisos de equidad
    simulation/  simulador con reloj virtual para tests y `pnpm simulate`
    demo/        datos de la demo (28 jugadores, 4 canchas)
  server/        Hono + Drizzle (PGlite o PostgreSQL) + WebSocket (ws) + sesiones
  client/        React 19 + Vite + Tailwind 4 (PWA). Rutas, componentes, store optimista
```

## Modelo de datos

El **torneo es un agregado** con event sourcing:

- `tournament_events`: log inmutable de hechos (`match_finished`, `player_added`, …),
  agrupados por lote (`batch_id` = un comando del organizador) con actor y hora.
- `tournaments.state`: proyección JSON del estado actual (jugadores, parejas,
  canchas, partidos, ajustes) + `revision` monotónica para realtime.
- `users`, `sessions`: organizadores.

Entidades del dominio (en `state`): `Player`, `Team`, `Court`, `Match` (con
`sides`, `sets`), `PointsAdjustment`, `TournamentConfig` (`MatchFormat`,
`ScoringRules`, `PairingRules`, `tiebreakers`).

**Nada derivado se persiste.** Estadísticas (PJ, PG, PE, PP, sets, games,
compañeros, rivales, rachas, descanso), ranking y estado de cada jugador se
recalculan a partir de los partidos finalizados. Editar un resultado o deshacer
nunca deja números inconsistentes.

## Flujo de un comando

```
UI ──► decide(state, command, {now}) ──► eventos ──► reduce(state, event)* ──► state'
        │ valida reglas (DomainError)             │
        │ + SchedulingEngine agrega los partidos   │ el cliente aplica lo mismo de forma
        │   que correspondan (canchas libres)      │ OPTIMISTA; el servidor confirma
```

- `decide` es determinista: ids y "azar" derivan de `seed + version`. Cliente y
  servidor producen exactamente los mismos eventos.
- El servidor serializa los comandos por torneo (mutex), persiste eventos + estado
  y hace broadcast por WebSocket (`{type:'state', revision, state}`).
- **Deshacer**: se marca `undone` el último lote y se reproduce el log
  (`replay`). Solo se puede deshacer el último comando no deshecho (LIFO).
- **Offline**: los comandos pendientes se guardan en `localStorage` y se
  reintentan al reconectar. El indicador de sincronización lo muestra.

## Motor de emparejamiento

`proposeLineup(candidatos, reglas)` evalúa **todas** las alineaciones posibles
dentro de un pool de 12 candidatos (ordenados por menos partidos → más descanso)
y elige la de menor costo:

| término       | mide                                                    | peso (presets) |
|---------------|---------------------------------------------------------|----------------|
| balance       | partidos "de más" respecto del que menos jugó           | 10 (dominante) |
| consecutive   | partidos seguidos por encima de `maxConsecutive`        | 5              |
| rest          | déficit de descanso (0 = el que más esperó)             | 0.4–0.5        |
| partner       | veces que las parejas propuestas ya jugaron juntas      | 0.6–2.0        |
| opponent      | veces que los cruces ya se enfrentaron                  | 0.25–0.8       |
| sameMatch     | partido exacto repetido                                 | 1–1.5          |
| strength      | diferencia de fuerza entre lados                        | 0–1.5          |
| levelSpread   | dispersión de fuerza entre los 4 (Por nivel)            | 0–1.5          |
| mix           | 1 − dispersión dentro de cada pareja (Mejor + peor)     | 0–1.5          |
| avoid         | alineación a evitar (rehacer / cancelar)                | 20             |
| jitter        | ruido determinista                                      | 0.05–1         |

Cada estrategia (Random, Equilibrado, Por nivel, Mejor + peor, Rotación máxima)
es un juego de pesos; Personalizado usa los porcentajes del organizador.

**Fuerza** de un jugador (1–5): nivel declarado mezclado con el percentil del
ranking en vivo; a partir de 3 partidos manda el ranking.

## Scheduling: por qué no hay cola automática persistida

Una cola fija de "próximos" encierra a los 4 que recién terminan en el mismo
grupo (en simulación: 58 parejas repetidas en 50 partidos). Por eso:

1. Cuando se libera una cancha, el partido se arma **en ese momento** con todos
   los disponibles (los que recién terminaron quedan naturalmente atrás por descanso).
2. "Próximos" es una **proyección determinista** (`projectUpcoming`): qué armaría
   el motor si se liberaran canchas ahora. Todos los clientes muestran lo mismo.
3. Al liberarse la cancha, se **respeta lo anunciado** si sigue siendo justo
   (tolerancia de costo 1; una diferencia de partidos jugados siempre pesa más).
   En simulación coincide en 119 de 120 casos.
4. La **cola manual** (partidos creados por el organizador o devueltos a la cola)
   tiene prioridad sobre la generación automática.

**Llegadas tarde / pausas**: `fairnessOffset` hace que el jugador arranque al
mínimo de partidos del resto (ni acapara canchas ni queda castigado).

## Métricas (pnpm simulate · 28 jugadores · 4 canchas · 50 partidos)

Todas las estrategias: diferencia máxima de partidos jugados = 1, cero rachas
por encima del máximo, descanso máximo ≈ 30 min. Equilibrado: Δ fuerza 0.20
vs 0.30 random; 0–3 parejas repetidas; ~6–15 rivales repetidos vs ~30 random.

## Realtime y seguridad

- WebSocket público de solo lectura (`/ws`), suscripción por torneo.
- Toda mutación pasa por `POST /api/tournaments/:id/commands` con sesión de
  organizador (cookie HttpOnly firmada) y validación Zod + reglas de dominio.
- Público: `GET /api/tournaments/public/:id`, `/eventos/:id/live` (TV), `/e/:id` (QR).
