import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildWeatherReport, type PollCity } from "@weatherwear/shared";

export const runtime = "nodejs";

type CityRow = PollCity & {
  slug: string;
  country: string;
  admin1: string | null;
};

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Missing Supabase server env vars" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const { error: authError } = await supabase.auth.getUser(token);
  if (authError) {
    return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
  }

  async function finishRun(
    runId: string,
    status: "success" | "error",
    citiesPolled: number,
    errorMessage?: string
  ) {
    await supabase
      .from("worker_runs")
      .update({
        status,
        cities_polled: citiesPolled,
        error_message: errorMessage ?? null,
        finished_at: new Date().toISOString()
      })
      .eq("id", runId);
  }

  const { data: run, error: runError } = await supabase
    .from("worker_runs")
    .insert({ status: "running" })
    .select("id")
    .single();

  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 });
  }

  let citiesPolled = 0;

  try {
    const { data: cities, error: cityError } = await supabase
      .from("cities")
      .select("id, slug, name, country, admin1, latitude, longitude, timezone")
      .order("name");

    if (cityError) throw cityError;

    for (const city of (cities ?? []) as CityRow[]) {
      const report = await buildWeatherReport(city);
      const { error: reportError } = await supabase
        .from("weather_reports")
        .upsert(report, { onConflict: "city_id" });

      if (reportError) throw reportError;
      citiesPolled += 1;
    }

    await finishRun(run.id as string, "success", citiesPolled);
    return NextResponse.json({ status: "success", citiesPolled });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(run.id as string, "error", citiesPolled, message);
    return NextResponse.json({ error: message, citiesPolled }, { status: 500 });
  }
}
