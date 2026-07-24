# Pálpito

Plataforma de apuestas deportivas en fase de aprendizaje: partidos reales pre-partido,
cuotas reales de mercado y apuestas con **fichas de prueba** (sin dinero real).

*El presentimiento que te hace apostar.* El logo es un pulso que late y sube, como la cuota.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind 4
- **Supabase** — Auth, Postgres, RLS; el dinero se mueve solo en funciones atómicas de la base
- **The Odds API** — partidos próximos, cuotas reales y resultados para liquidar
- **Vercel** para el despliegue

La guía maestra de diseño y producto vive en `palpito_guia.md` (carpeta de diseño, fuera del repo).
Las reglas para agentes están en `AGENTS.md`.

## Correr en local

```bash
npm install
cp .env.example .env.local   # y rellenar (ver abajo)
npm run dev
```

En local un programador interno (`src/lib/automatizacion.ts`) sincroniza la cartelera
cada 12 h y cierra resultados + liquida apuestas cada 30 min, sin intervención manual.

## Variables de entorno

| Variable | Qué es |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública (publishable/anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio — solo servidor, jamás en el navegador |
| `ODDS_API_KEY` | API key de [the-odds-api.com](https://the-odds-api.com) (plan gratis) |
| `SINCRONIZACION_SECRETO` | Clave propia para los endpoints `/api/sincronizar` y `/api/resultados` |
| `CRON_SECRET` | (Solo Vercel) secreto que Vercel envía en sus crons |

## Base de datos

Las migraciones están en `supabase/migrations/` (orden por nombre) y los datos de
ejemplo en `supabase/seed.sql`. Se aplican desde el SQL Editor de Supabase o con la
CLI (`supabase db push`).

Piezas clave del modelo (ver guía §6):

- El saldo es la **suma del libro `movimientos`**, nunca una columna editable.
- `apostar(...)` y `liquidar_evento(...)` son funciones `security definer` ejecutables
  solo con la clave de servicio: idempotencia, verificación de cuotas y pagos, todo atómico.
- RLS: catálogo de lectura pública; apuestas y movimientos solo del dueño.

## Desplegar en Vercel

1. Importar este repo en Vercel (framework: Next.js, sin configuración extra).
2. Cargar las variables de entorno de la tabla de arriba (`CRON_SECRET` incluida:
   cualquier cadena larga aleatoria).
3. `vercel.json` ya trae dos crons diarios (sincronizar y resultados). **Nota:** el plan
   Hobby de Vercel solo permite crons diarios; para cerrar resultados cada 30 min,
   apuntar un cron externo gratuito (p. ej. cron-job.org) a
   `https://TU-DOMINIO/api/resultados?clave=SINCRONIZACION_SECRETO`.

## Automatización de datos

- `/api/sincronizar` — trae partidos y cuotas reales (MLB + ligas de fútbol de
  `src/lib/odds-api.ts`). Los eventos con apuestas no se tocan (cuotas congeladas).
- `/api/resultados` — cierra eventos terminados con su marcador y **liquida**:
  resuelve líneas, marca apuestas ganadas/perdidas/anuladas y paga vía `movimientos`.
  Solo consulta ligas con partidos pendientes para cuidar los créditos de la API.
