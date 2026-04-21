# WeatherWear Lite Architecture

## System Goal

WeatherWear Lite is a small multi-service system for Assignment 4. It polls live city weather data, stores the latest weather in Supabase, and shows signed-in users realtime updates for their saved cities.

## Services

### Frontend: `apps/web`

- Next.js app deployed to Vercel.
- Uses Supabase Auth for email/password sign up and sign in.
- Lets users save cities, search new cities, choose Fahrenheit/Celsius, and set a simple temperature sensitivity.
- Reads `cities`, `user_cities`, `user_preferences`, `weather_reports`, and `worker_runs`.
- Subscribes to Supabase Realtime changes on `weather_reports` and `worker_runs`.

### Worker: `apps/worker`

- Node.js worker deployed to Railway.
- Polls Open-Meteo Forecast API every 10 minutes by default.
- Fetches current temperature, apparent temperature, wind, weather code, rain probability, and UV index.
- Upserts one latest `weather_reports` row per city.
- Writes `worker_runs` rows so the frontend can show worker health.

### Database: Supabase

Schema is in `supabase/schema.sql`.

Tables:

- `profiles`: one row per authenticated user.
- `user_preferences`: each user's unit and temperature sensitivity.
- `cities`: tracked cities, seeded with seven defaults.
- `user_cities`: many-to-many saved city list.
- `weather_reports`: latest weather per city.
- `worker_runs`: worker health and poll history.

RLS:

- Users can read and update only their own profile, preferences, and saved city rows.
- Authenticated users can read cities, weather reports, and worker runs.
- The worker uses `SUPABASE_SERVICE_ROLE_KEY` for writes.

Realtime:

- `weather_reports` and `worker_runs` are added to the `supabase_realtime` publication.
- Frontend subscriptions update weather cards without refresh.

## Data Flow

```txt
Open-Meteo Forecast API
  -> Railway worker
  -> Supabase cities/weather_reports/worker_runs
  -> Supabase Realtime
  -> Next.js dashboard on Vercel
```

## External API

Open-Meteo is used because it is public, no-key, and suitable for a class project. The worker stores Fahrenheit values and the frontend converts to Celsius when users choose that preference.

## Deployment Env Vars

Vercel frontend:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Railway worker:

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
POLL_INTERVAL_MS=600000
RUN_ONCE=false
```

