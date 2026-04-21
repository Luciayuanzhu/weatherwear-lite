"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  buildWeatherAdvice,
  citySlug,
  defaultCities,
  formatTemperature,
  formatWind,
  type Sensitivity,
  type TempUnit,
  weatherCodeLabel
} from "@weatherwear/shared";
import {
  CloudSun,
  Info,
  Loader2,
  LogOut,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Umbrella,
  Wind
} from "lucide-react";
import { hasSupabaseEnv, supabase } from "@/lib/supabase";
import type { City, UserPreferences, WeatherReport, WorkerRun } from "@/lib/types";

const DEFAULT_PREFERENCES = {
  temp_unit: "fahrenheit" as TempUnit,
  sensitivity: "balanced" as Sensitivity
};

type CityLinkRow = {
  city_id: string;
  cities: City | City[] | null;
};

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [savedCities, setSavedCities] = useState<City[]>([]);
  const [reports, setReports] = useState<Record<string, WeatherReport>>({});
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [workerRun, setWorkerRun] = useState<WorkerRun | null>(null);
  const [query, setQuery] = useState("");
  const [cityMessage, setCityMessage] = useState("");
  const savedCityIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!hasSupabaseEnv) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setSavedCities([]);
      setReports({});
      setPreferences(null);
      return;
    }

    void loadDashboard(session.user.id);

    const channel = supabase
      .channel("weatherwear-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "weather_reports" },
        (payload) => {
          const next = payload.new as WeatherReport;
          if (!next?.city_id || !savedCityIdsRef.current.has(next.city_id)) return;
          setReports((current) => ({ ...current, [next.city_id]: next }));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "worker_runs" },
        (payload) => {
          const next = payload.new as WorkerRun;
          if (next?.id) setWorkerRun(next);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // loadDashboard is intentionally called only when the auth session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function loadDashboard(userId: string) {
    setBusy(true);
    setCityMessage("");

    await supabase.from("profiles").upsert({
      user_id: userId,
      email: session?.user.email ?? null
    });

    const preferenceRow = await getOrCreatePreferences(userId);
    setPreferences(preferenceRow);

    const [{ data: allCities }, { data: links }, { data: latestRun }] = await Promise.all([
      supabase.from("cities").select("*").order("is_default", { ascending: false }).order("name"),
      supabase.from("user_cities").select("city_id, cities(*)").order("created_at"),
      supabase.from("worker_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle()
    ]);

    const availableCities = (allCities ?? []) as City[];
    const userCities = ((links ?? []) as CityLinkRow[])
      .map((row) => (Array.isArray(row.cities) ? row.cities[0] : row.cities))
      .filter((city): city is City => Boolean(city));

    setCities(availableCities);
    setSavedCities(userCities);
    savedCityIdsRef.current = new Set(userCities.map((city) => city.id));
    setWorkerRun((latestRun as WorkerRun | null) ?? null);

    if (userCities.length > 0) {
      const { data: weatherRows } = await supabase
        .from("weather_reports")
        .select("*")
        .in(
          "city_id",
          userCities.map((city) => city.id)
        );

      const nextReports = Object.fromEntries(
        ((weatherRows ?? []) as WeatherReport[]).map((report) => [report.city_id, report])
      );
      setReports(nextReports);
    }

    setBusy(false);
  }

  async function getOrCreatePreferences(userId: string): Promise<UserPreferences> {
    const { data } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (data) return data as UserPreferences;

    const { data: inserted, error } = await supabase
      .from("user_preferences")
      .insert({ user_id: userId, ...DEFAULT_PREFERENCES })
      .select("*")
      .single();

    if (error) throw error;
    return inserted as UserPreferences;
  }

  async function handleAuth() {
    setAuthMessage("");
    setBusy(true);
    const credentials = { email, password };
    const result =
      authMode === "signin"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp({
            ...credentials,
            options: {
              emailRedirectTo: window.location.origin
            }
          });

    if (result.error) {
      setAuthMessage(result.error.message);
    } else if (authMode === "signup") {
      setAuthMessage("Account created. Check email if confirmation is enabled.");
    }
    setBusy(false);
  }

  async function updatePreferences(patch: Partial<UserPreferences>) {
    if (!session || !preferences) return;
    const next = { ...preferences, ...patch };
    setPreferences(next);

    await supabase.from("user_preferences").upsert({
      user_id: session.user.id,
      temp_unit: next.temp_unit,
      sensitivity: next.sensitivity
    });
  }

  async function addExistingCity(city: City) {
    if (!session) return;
    setCityMessage("");
    await supabase.from("user_cities").upsert({
      user_id: session.user.id,
      city_id: city.id
    });
    await loadDashboard(session.user.id);
  }

  async function removeCity(cityId: string) {
    if (!session) return;
    setCityMessage("");
    await supabase.from("user_cities").delete().eq("user_id", session.user.id).eq("city_id", cityId);
    await loadDashboard(session.user.id);
  }

  async function searchAndAddCity() {
    if (!session) return;
    const term = query.trim();
    if (!term) return;

    setCityMessage("");
    setBusy(true);

    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        term
      )}&count=1&language=en&format=json`
    );
    const payload = (await response.json()) as {
      results?: Array<{
        name: string;
        country: string;
        country_code?: string;
        admin1?: string;
        latitude: number;
        longitude: number;
        timezone?: string;
      }>;
    };
    const match = payload.results?.[0];

    if (!match) {
      setCityMessage("City not found.");
      setBusy(false);
      return;
    }

    const slug = citySlug(match.name, match.country_code);
    const { data: city, error } = await supabase
      .from("cities")
      .upsert(
        {
          slug,
          name: match.name,
          country: match.country,
          admin1: match.admin1 ?? null,
          latitude: match.latitude,
          longitude: match.longitude,
          timezone: match.timezone ?? "auto",
          is_default: false
        },
        { onConflict: "slug" }
      )
      .select("*")
      .single();

    if (error || !city) {
      setCityMessage(error?.message ?? "Could not add city.");
      setBusy(false);
      return;
    }

    await addExistingCity(city as City);
    setQuery("");
    setBusy(false);
  }

  async function refreshWeatherNow() {
    if (!session) return;
    setBusy(true);
    setCityMessage("");

    try {
      const response = await fetch("/api/refresh-weather", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Weather refresh failed.");
      }
      await loadDashboard(session.user.id);
    } catch (error) {
      setCityMessage(error instanceof Error ? error.message : "Weather refresh failed.");
      setBusy(false);
    }
  }

  const unsavedDefaultCities = useMemo(() => {
    const savedSlugs = new Set(savedCities.map((city) => city.slug));
    const knownDefaults = cities.filter((city) => city.is_default);
    const fallbackDefaults = defaultCities
      .filter((city) => !knownDefaults.some((known) => known.slug === city.slug))
      .map((city) => ({ ...city, id: city.slug, is_default: true }));

    return [...knownDefaults, ...(fallbackDefaults as City[])].filter((city) => !savedSlugs.has(city.slug));
  }, [cities, savedCities]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-sky" aria-label="Loading" />
      </main>
    );
  }

  if (!hasSupabaseEnv) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6">
        <section className="rounded-lg border border-line bg-field p-6 shadow-soft">
          <h1 className="text-2xl font-semibold">WeatherWear Lite</h1>
          <p className="mt-3 text-sm text-slate-600">
            Add Supabase environment variables before running the app.
          </p>
          <pre className="mt-4 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-50">
            NEXT_PUBLIC_SUPABASE_URL{"\n"}NEXT_PUBLIC_SUPABASE_ANON_KEY
          </pre>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center px-5 py-10">
        <section className="w-full max-w-md rounded-lg border border-line bg-field p-6 shadow-soft">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-sky text-white">
              <CloudSun className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">WeatherWear Lite</h1>
              <p className="text-sm text-slate-600">City weather, outfit cues, and umbrella calls.</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2 rounded-md bg-mist p-1">
            <button
              className={`rounded px-3 py-2 text-sm font-medium ${
                authMode === "signin" ? "bg-field text-ink shadow-sm" : "text-slate-600"
              }`}
              onClick={() => setAuthMode("signin")}
              type="button"
            >
              Sign in
            </button>
            <button
              className={`rounded px-3 py-2 text-sm font-medium ${
                authMode === "signup" ? "bg-field text-ink shadow-sm" : "text-slate-600"
              }`}
              onClick={() => setAuthMode("signup")}
              type="button"
            >
              Sign up
            </button>
          </div>

          <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="email">
            Email
          </label>
          <input
            className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2"
            id="email"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />

          <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="password">
            Password
          </label>
          <input
            className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2"
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />

          <button
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            disabled={busy || !email || password.length < 6}
            onClick={handleAuth}
            type="button"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {authMode === "signin" ? "Sign in" : "Create account"}
          </button>

          {authMessage ? <p className="mt-4 text-sm text-sun">{authMessage}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-6">
      <header className="flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-sky text-white">
            <CloudSun className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold">WeatherWear Lite</h1>
            <p className="text-sm text-slate-600">{session.user.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WorkerStatus workerRun={workerRun} />
          <button
            className="inline-flex items-center gap-2 rounded-md border border-line bg-field px-3 py-2 text-sm font-medium"
            disabled={busy}
            onClick={() => void refreshWeatherNow()}
            type="button"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-line bg-field px-3 py-2 text-sm font-medium"
            onClick={() => supabase.auth.signOut()}
            type="button"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </header>

      <section className="grid gap-5 py-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-5">
          <section className="rounded-lg border border-line bg-field p-4 shadow-soft">
            <div className="mb-4 flex items-center gap-2">
              <Settings className="h-4 w-4 text-sky" />
              <h2 className="text-base font-semibold">Preferences</h2>
            </div>

            <label className="block text-sm font-medium text-slate-700" htmlFor="unit">
              Temperature
            </label>
            <select
              className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2"
              id="unit"
              onChange={(event) => updatePreferences({ temp_unit: event.target.value as TempUnit })}
              value={preferences?.temp_unit ?? DEFAULT_PREFERENCES.temp_unit}
            >
              <option value="fahrenheit">Fahrenheit</option>
              <option value="celsius">Celsius</option>
            </select>

            <div className="mt-4 flex items-center gap-1.5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="sensitivity">
                Temperature feel
              </label>
              <InfoTooltip text="Personalizes outfit advice and comfort scores. Runs cold treats cool weather as feeling colder; runs warm treats cool weather as easier to handle." />
            </div>
            <select
              className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2"
              id="sensitivity"
              onChange={(event) => updatePreferences({ sensitivity: event.target.value as Sensitivity })}
              value={preferences?.sensitivity ?? DEFAULT_PREFERENCES.sensitivity}
            >
              <option value="balanced">Balanced</option>
              <option value="runs_cold">Runs cold</option>
              <option value="runs_warm">Runs warm</option>
            </select>
          </section>

          <section className="rounded-lg border border-line bg-field p-4 shadow-soft">
            <div className="mb-4 flex items-center gap-2">
              <Search className="h-4 w-4 text-sky" />
              <h2 className="text-base font-semibold">Cities</h2>
            </div>

            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void searchAndAddCity();
                }}
                placeholder="Search city"
                value={query}
              />
              <button
                aria-label="Add city"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-leaf text-white disabled:opacity-60"
                disabled={busy || !query.trim()}
                onClick={searchAndAddCity}
                title="Add city"
                type="button"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </button>
            </div>
            {cityMessage ? <p className="mt-3 text-sm text-sun">{cityMessage}</p> : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {unsavedDefaultCities.slice(0, 7).map((city) => (
                <button
                  className="rounded-md border border-line bg-mist px-2.5 py-1.5 text-xs font-medium text-slate-700"
                  key={city.slug}
                  onClick={() => addExistingCity(city)}
                  type="button"
                >
                  {city.name}
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Saved Cities</h2>
              <p className="text-sm text-slate-600">
                {savedCities.length} {savedCities.length === 1 ? "city" : "cities"}
              </p>
            </div>
          </div>

          {savedCities.length === 0 ? (
            <section className="rounded-lg border border-dashed border-line bg-field p-8 text-center">
              <MapPin className="mx-auto h-8 w-8 text-sky" />
              <p className="mt-3 text-sm text-slate-600">Add a city to start tracking weather.</p>
            </section>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {savedCities.map((city) => (
                <WeatherCard
                  city={city}
                  key={city.id}
                  onRemove={() => removeCity(city.id)}
                  preferences={preferences}
                  report={reports[city.id]}
                />
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function WeatherCard({
  city,
  report,
  preferences,
  onRemove
}: {
  city: City;
  report?: WeatherReport;
  preferences: UserPreferences | null;
  onRemove: () => void;
}) {
  const unit = preferences?.temp_unit ?? DEFAULT_PREFERENCES.temp_unit;
  const advice = report
    ? buildWeatherAdvice({
        temperatureF: Number(report.temperature_f),
        apparentTemperatureF: Number(report.apparent_temperature_f),
        rainProbability: report.precipitation_probability,
        windSpeedMph: Number(report.wind_speed_mph),
        uvIndex: report.uv_index,
        weatherCode: report.weather_code,
        sensitivity: preferences?.sensitivity ?? DEFAULT_PREFERENCES.sensitivity
      })
    : null;

  return (
    <article className="rounded-lg border border-line bg-field p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{city.name}</h3>
          <p className="text-sm text-slate-600">
            {[city.admin1, city.country].filter(Boolean).join(", ")}
          </p>
        </div>
        <button
          aria-label={`Remove ${city.name}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-slate-600 hover:bg-mist"
          onClick={onRemove}
          title={`Remove ${city.name}`}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {!report ? (
        <div className="mt-8 rounded-md bg-mist p-4 text-sm text-slate-600">
          Waiting for the worker to poll this city.
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-4xl font-semibold leading-none">
                {formatTemperature(Number(report.temperature_f), unit)}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Feels {formatTemperature(Number(report.apparent_temperature_f), unit)}
              </p>
            </div>
            <div className="rounded-md bg-mist px-3 py-2 text-right">
              <div className="flex items-center justify-end gap-1.5">
                <p className="text-xs font-medium uppercase text-slate-500">Score</p>
                <InfoTooltip text="Comfort score from 0 to 100 based on feels-like temperature, rain probability, wind speed, and your temperature feel preference." />
              </div>
              <p className="text-2xl font-semibold text-leaf">{advice?.score}</p>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-2 text-sm">
            <Metric label="Sky" value={weatherCodeLabel(report.weather_code)} />
            <Metric label="Rain" value={`${report.precipitation_probability}%`} />
            <Metric label="Wind" value={formatWind(Number(report.wind_speed_mph))} />
          </dl>

          <div className="mt-5 space-y-2">
            <AdviceLine icon={<CloudSun className="h-4 w-4" />} text={advice?.outfit ?? ""} />
            <AdviceLine icon={<Umbrella className="h-4 w-4" />} text={advice?.umbrella ?? ""} />
            <AdviceLine icon={<Wind className="h-4 w-4" />} text={advice?.comfort ?? ""} />
          </div>

          <p className="mt-5 text-xs text-slate-500">Updated {relativeTime(report.updated_at)}</p>
        </>
      )}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-mist p-2">
      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-semibold leading-snug text-ink">{value}</dd>
    </div>
  );
}

function AdviceLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-slate-700">
      <span className="text-sky">{icon}</span>
      <span>{text}</span>
    </p>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        aria-label={text}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-500 hover:text-sky focus-visible:text-sky"
        type="button"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-6 z-10 hidden w-56 -translate-x-1/2 rounded-md border border-line bg-ink px-3 py-2 text-left text-xs font-normal leading-snug text-white shadow-soft group-focus-within:block group-hover:block">
        {text}
      </span>
    </span>
  );
}

function WorkerStatus({ workerRun }: { workerRun: WorkerRun | null }) {
  if (!workerRun) {
    return (
      <span className="rounded-md border border-line bg-field px-3 py-2 text-sm text-slate-600">
        Worker pending
      </span>
    );
  }

  const tone =
    workerRun.status === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : workerRun.status === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <span className={`rounded-md border px-3 py-2 text-sm ${tone}`}>
      Worker {workerRun.status} · {relativeTime(workerRun.started_at)}
    </span>
  );
}

function relativeTime(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  return `${hours} hours ago`;
}
