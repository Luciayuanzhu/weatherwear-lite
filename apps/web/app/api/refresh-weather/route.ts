import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildWeatherReport, type PollCity } from "@weatherwear/shared";

export const runtime = "nodejs";
const CITY_REFRESH_DELAY_MS = 500;

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

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { cityId?: string } | null;
  const cityId = typeof body?.cityId === "string" && body.cityId.trim() ? body.cityId.trim() : null;

  if (cityId) {
    const { data: link, error: linkError } = await supabase
      .from("user_cities")
      .select("city_id")
      .eq("user_id", authData.user.id)
      .eq("city_id", cityId)
      .maybeSingle();

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    if (!link) {
      return NextResponse.json({ error: "City is not saved for this user" }, { status: 403 });
    }
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
  const failures: string[] = [];

  try {
    let cityQuery = supabase
      .from("cities")
      .select("id, slug, name, country, admin1, latitude, longitude, timezone")
      .order("name");

    if (cityId) {
      cityQuery = cityQuery.eq("id", cityId);
    }

    const { data: cities, error: cityError } = await cityQuery;

    if (cityError) throw cityError;

    for (const city of (cities ?? []) as CityRow[]) {
      try {
        const report = await buildWeatherReport(city);
        const { error: reportError } = await supabase
          .from("weather_reports")
          .upsert(report, { onConflict: "city_id" });

        if (reportError) throw reportError;
        citiesPolled += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (cityId) throw error;
        failures.push(`${city.name}: ${message}`);
      }

      if (!cityId) {
        await delay(CITY_REFRESH_DELAY_MS);
      }
    }

    if (failures.length > 0 && citiesPolled === 0) {
      throw new Error(failures.slice(0, 3).join("; "));
    }

    await finishRun(
      run.id as string,
      "success",
      citiesPolled,
      failures.length > 0 ? `${failures.length} cities skipped: ${failures.slice(0, 3).join("; ")}` : undefined
    );
    return NextResponse.json({
      status: failures.length > 0 ? "partial_success" : "success",
      citiesPolled,
      citiesSkipped: failures.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(run.id as string, "error", citiesPolled, message);
    return NextResponse.json({ error: message, citiesPolled }, { status: 500 });
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
