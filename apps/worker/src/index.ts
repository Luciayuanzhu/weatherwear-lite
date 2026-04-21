import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { weatherCodeLabel } from "@weatherwear/shared";

type CityRow = {
  id: string;
  slug: string;
  name: string;
  country: string;
  admin1: string | null;
  latitude: number | string;
  longitude: number | string;
  timezone: string | null;
};

type OpenMeteoForecast = {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  hourly?: {
    time?: string[];
    precipitation_probability?: Array<number | null>;
    uv_index?: Array<number | null>;
  };
};

const supabaseUrl = mustGetEnv("SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceRoleKey = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS ?? "600000");
const runOnce = process.env.RUN_ONCE === "true";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function main() {
  console.log(`WeatherWear worker starting. interval=${pollIntervalMs}ms runOnce=${runOnce}`);
  await pollOnce();

  if (runOnce) return;

  setInterval(() => {
    pollOnce().catch((error) => {
      console.error("Poll loop failed", error);
    });
  }, pollIntervalMs);
}

async function pollOnce() {
  const runId = await startWorkerRun();
  let citiesPolled = 0;

  try {
    const { data: cities, error } = await supabase
      .from("cities")
      .select("id, slug, name, country, admin1, latitude, longitude, timezone")
      .order("name");

    if (error) throw error;

    for (const city of (cities ?? []) as CityRow[]) {
      await pollCity(city);
      citiesPolled += 1;
    }

    await finishWorkerRun(runId, "success", citiesPolled);
    console.log(`Poll complete. cities=${citiesPolled}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishWorkerRun(runId, "error", citiesPolled, message);
    console.error("Poll failed", error);
  }
}

async function pollCity(city: CityRow) {
  const forecast = await fetchForecast(city);
  const current = forecast.current;

  if (!current || current.temperature_2m == null || current.apparent_temperature == null) {
    throw new Error(`Open-Meteo returned no current weather for ${city.name}`);
  }

  const rainProbability = nextSixHourMax(forecast.hourly?.precipitation_probability);
  const uvIndex = nextSixHourMax(forecast.hourly?.uv_index);
  const summary = weatherCodeLabel(current.weather_code);

  const { error } = await supabase.from("weather_reports").upsert(
    {
      city_id: city.id,
      observed_at: new Date().toISOString(),
      temperature_f: current.temperature_2m,
      apparent_temperature_f: current.apparent_temperature,
      precipitation_probability: rainProbability,
      wind_speed_mph: current.wind_speed_10m ?? 0,
      weather_code: current.weather_code ?? null,
      uv_index: uvIndex,
      summary,
      raw: forecast
    },
    { onConflict: "city_id" }
  );

  if (error) throw error;
  console.log(`Updated ${city.name}: ${Math.round(current.temperature_2m)}F, ${summary}`);
}

async function fetchForecast(city: CityRow): Promise<OpenMeteoForecast> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(city.latitude));
  url.searchParams.set("longitude", String(city.longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m"
  );
  url.searchParams.set("hourly", "precipitation_probability,uv_index");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", city.timezone ?? "auto");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo ${response.status} for ${city.name}`);
  }

  return (await response.json()) as OpenMeteoForecast;
}

async function startWorkerRun(): Promise<string> {
  const { data, error } = await supabase
    .from("worker_runs")
    .insert({ status: "running" })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function finishWorkerRun(
  runId: string,
  status: "success" | "error",
  citiesPolled: number,
  errorMessage?: string
) {
  const { error } = await supabase
    .from("worker_runs")
    .update({
      status,
      cities_polled: citiesPolled,
      error_message: errorMessage ?? null,
      finished_at: new Date().toISOString()
    })
    .eq("id", runId);

  if (error) throw error;
}

function nextSixHourMax(values?: Array<number | null>): number {
  if (!values?.length) return 0;
  return Math.round(
    Math.max(
      0,
      ...values
        .slice(0, 6)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    )
  );
}

function mustGetEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

