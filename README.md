# WeatherWear Lite

WeatherWear Lite is a small Assignment 4 system: a Railway worker polls Open-Meteo, writes weather rows to Supabase, and a Next.js dashboard updates through Supabase Realtime.

## Stack

- Next.js + Tailwind CSS in `apps/web`
- Node.js worker in `apps/worker`
- Supabase Auth, Postgres, RLS, and Realtime
- Open-Meteo Forecast API
- Vercel frontend deployment
- Railway worker deployment

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create a Supabase project.

3. Run the SQL in `supabase/schema.sql` in the Supabase SQL Editor.

4. Copy `.env.example` to `.env.local` and fill:

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

5. Run the web app:

```bash
npm run dev:web
```

6. In another terminal, run one worker poll:

```bash
RUN_ONCE=true npm run dev:worker
```

## Deployment

### Vercel

- Root directory: repository root
- Build command: `npm run build -w @weatherwear/web`
- Output directory: `apps/web/.next`
- Env vars:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Railway

- Root directory: repository root
- Build command: `npm run build -w @weatherwear/worker`
- Start command: `npm run start -w @weatherwear/worker`
- Env vars:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `POLL_INTERVAL_MS=600000`
  - `RUN_ONCE=false`

## Assignment Notes

- Users can sign up with Supabase Auth.
- Each user has personalized saved cities and weather preferences.
- The worker polls a live public weather API.
- Supabase Realtime pushes new weather rows to the frontend.
- `CLAUDE.md` documents the architecture.

