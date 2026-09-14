# North Padel — Cancha Abierta

Sistema web para manejar en vivo una **cancha abierta** o torneo dinámico de pádel:
carga los nombres, elegí canchas y reglas, tocá **Comenzar** y el sistema arma los
partidos, actualiza el ranking y decide quién juega, con quién, contra quién y en
qué cancha. Sin Excel.

## Correr en desarrollo

```bash
pnpm install
pnpm dev
```

- Cliente: http://localhost:5173 (proxy a la API)
- API + WebSocket: http://localhost:3000
- Usuario inicial: `admin@northpadel.com` / `northpadel` (configurable en `.env`)
- Al arrancar se crea la demo **"Cancha Abierta — Demo"** (28 jugadores, 4 canchas).

Sin `DATABASE_URL` se usa **PGlite** (PostgreSQL embebido) persistido en `./data/pglite`.
No hace falta Docker ni instalar Postgres para desarrollar.

## Producción

```bash
cp .env.example .env      # completar DATABASE_URL, SESSION_SECRET, ADMIN_*
pnpm build
pnpm start                # sirve API + WS + cliente en PORT (3000)
```

O con Docker: `docker build -t north-padel . && docker run -p 3000:3000 --env-file .env north-padel`.
`DATABASE_URL` apunta al PostgreSQL de la VM; el esquema se crea solo al arrancar.

### Deploy actual

- URL: https://northpadel.becode.com.ar (Cloudflare proxy → Traefik de Coolify → contenedor).
- Coolify: proyecto **Becode**, entorno **production**, app `northpadel` (build pack Dockerfile,
  puerto 3000, healthcheck `/api/health`) + base `northpadel-db` (postgres:17-alpine en la misma VM).
- Fuente: este repo (`becodeb/northpadel`, rama `main`). Cada push a `main` dispara el deploy por webhook.
- Redeploy manual: `Deploy-CoolifyApp -Uuid <uuid de la app>` desde el helper de `coolify-conexion`.

## Tests y simulación

```bash
pnpm test        # 75 tests: scoring, ranking, pairing, comandos, casos borde y simulación
pnpm simulate    # reporte de equidad: 28 jugadores · 4 canchas · 50 partidos, todas las estrategias
pnpm simulate 13 3 40 balanced
pnpm typecheck
```

## Pantallas

| Ruta | Quién | Qué |
|------|-------|-----|
| `/login` | organizador | ingreso |
| `/eventos` | organizador | historial de eventos, duplicar, eliminar |
| `/eventos/nuevo` | organizador | wizard: tipo → jugadores → canchas → partido → puntos |
| `/eventos/:id` | organizador | **panel operativo**: canchas, carga de resultado, próximos, ranking, espera |
| `/eventos/:id/jugadores` | organizador | estados, niveles, agregar / pausar / ausentar |
| `/eventos/:id/partidos` | organizador | en juego, finalizados (editar resultado), cancelados |
| `/eventos/:id/ranking` | organizador | tabla completa con desempates |
| `/eventos/:id/configuracion` | organizador | formato, puntos, emparejamiento, desempates, canchas |
| `/eventos/:id/live` | público | pantalla para la TV del club |
| `/e/:id` | público (QR) | vista para jugadores: mi próximo partido, ranking, resultados |

Todo se actualiza en tiempo real (WebSocket). Si se corta la conexión, los
cambios quedan en cola y se sincronizan al volver; el indicador del header lo muestra.
La app se puede instalar como PWA desde el celular.

## Estructura

Ver [ARCHITECTURE.md](./ARCHITECTURE.md): modelo de datos, event sourcing, motor de
emparejamiento (función de costo y estrategias), scheduling, realtime y seguridad.
