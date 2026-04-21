create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  temp_unit text not null default 'fahrenheit' check (temp_unit in ('fahrenheit', 'celsius')),
  sensitivity text not null default 'balanced' check (sensitivity in ('runs_cold', 'balanced', 'runs_warm')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  country text not null,
  admin1 text,
  latitude numeric not null,
  longitude numeric not null,
  timezone text not null default 'auto',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.user_cities (
  user_id uuid not null references auth.users(id) on delete cascade,
  city_id uuid not null references public.cities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, city_id)
);

create table if not exists public.weather_reports (
  city_id uuid primary key references public.cities(id) on delete cascade,
  observed_at timestamptz not null,
  temperature_f numeric not null,
  apparent_temperature_f numeric not null,
  precipitation_probability integer not null default 0,
  wind_speed_mph numeric not null default 0,
  weather_code integer,
  uv_index numeric,
  summary text not null,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.worker_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'success', 'error')),
  cities_polled integer not null default 0,
  error_message text
);

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.cities enable row level security;
alter table public.user_cities enable row level security;
alter table public.weather_reports enable row level security;
alter table public.worker_runs enable row level security;

drop policy if exists "Users can read their profile" on public.profiles;
create policy "Users can read their profile"
  on public.profiles for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert their profile" on public.profiles;
create policy "Users can insert their profile"
  on public.profiles for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile"
  on public.profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can read their preferences" on public.user_preferences;
create policy "Users can read their preferences"
  on public.user_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert their preferences" on public.user_preferences;
create policy "Users can insert their preferences"
  on public.user_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their preferences" on public.user_preferences;
create policy "Users can update their preferences"
  on public.user_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Authenticated users can read cities" on public.cities;
create policy "Authenticated users can read cities"
  on public.cities for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can add cities" on public.cities;
create policy "Authenticated users can add cities"
  on public.cities for insert
  to authenticated
  with check (true);

drop policy if exists "Users can read their saved cities" on public.user_cities;
create policy "Users can read their saved cities"
  on public.user_cities for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can add their saved cities" on public.user_cities;
create policy "Users can add their saved cities"
  on public.user_cities for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can remove their saved cities" on public.user_cities;
create policy "Users can remove their saved cities"
  on public.user_cities for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Authenticated users can read weather reports" on public.weather_reports;
create policy "Authenticated users can read weather reports"
  on public.weather_reports for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read worker runs" on public.worker_runs;
create policy "Authenticated users can read worker runs"
  on public.worker_runs for select
  to authenticated
  using (true);

insert into public.cities (slug, name, country, admin1, latitude, longitude, timezone, is_default)
values
  ('chicago-us', 'Chicago', 'United States', 'Illinois', 41.8781, -87.6298, 'America/Chicago', true),
  ('new-york-us', 'New York', 'United States', 'New York', 40.7128, -74.0060, 'America/New_York', true),
  ('san-francisco-us', 'San Francisco', 'United States', 'California', 37.7749, -122.4194, 'America/Los_Angeles', true),
  ('seattle-us', 'Seattle', 'United States', 'Washington', 47.6062, -122.3321, 'America/Los_Angeles', true),
  ('austin-us', 'Austin', 'United States', 'Texas', 30.2672, -97.7431, 'America/Chicago', true),
  ('london-gb', 'London', 'United Kingdom', 'England', 51.5072, -0.1276, 'Europe/London', true),
  ('tokyo-jp', 'Tokyo', 'Japan', 'Tokyo', 35.6762, 139.6503, 'Asia/Tokyo', true)
on conflict (slug) do update set
  name = excluded.name,
  country = excluded.country,
  admin1 = excluded.admin1,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  timezone = excluded.timezone,
  is_default = excluded.is_default;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_user_preferences_updated_at on public.user_preferences;
create trigger touch_user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_weather_reports_updated_at on public.weather_reports;
create trigger touch_weather_reports_updated_at
  before update on public.weather_reports
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do update set email = excluded.email;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_cities (user_id, city_id)
  select new.id, id from public.cities where is_default = true
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.weather_reports replica identity full;
alter table public.worker_runs replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'weather_reports'
    ) then
      alter publication supabase_realtime add table public.weather_reports;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'worker_runs'
    ) then
      alter publication supabase_realtime add table public.worker_runs;
    end if;
  end if;
end $$;

