import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { buildWeatherReport } from "../../../packages/shared/src/polling";

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

const supabaseUrl = mustGetEnv("SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceRoleKey = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS ?? "60000");
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
  const report = await buildWeatherReport(city);

  const { error } = await supabase.from("weather_reports").upsert(report, { onConflict: "city_id" });

  if (error) throw error;
  console.log(`Updated ${city.name}: ${Math.round(report.temperature_f)}F, ${report.summary}`);
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

function mustGetEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
