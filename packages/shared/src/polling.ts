import { weatherCodeLabel } from "./weather";

export type PollCity = {
  id: string;
  name: string;
  latitude: number | string;
  longitude: number | string;
  timezone: string | null;
};

export type OpenMeteoForecast = {
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

export type WeatherReportPayload = {
  city_id: string;
  observed_at: string;
  temperature_f: number;
  apparent_temperature_f: number;
  precipitation_probability: number;
  wind_speed_mph: number;
  weather_code: number | null;
  uv_index: number;
  summary: string;
  raw: OpenMeteoForecast;
};

export async function buildWeatherReport(city: PollCity): Promise<WeatherReportPayload> {
  const forecast = await fetchForecast(city);
  return buildReportPayload(city, forecast);
}

export async function buildWeatherReports(cities: PollCity[]): Promise<WeatherReportPayload[]> {
  if (cities.length === 0) return [];
  if (cities.length === 1) return [await buildWeatherReport(cities[0])];

  const forecasts = await fetchForecasts(cities);
  return cities.map((city, index) => buildReportPayload(city, forecasts[index]));
}

function buildReportPayload(city: PollCity, forecast: OpenMeteoForecast): WeatherReportPayload {
  const current = forecast.current;

  if (!current || current.temperature_2m == null || current.apparent_temperature == null) {
    throw new Error(`Open-Meteo returned no current weather for ${city.name}`);
  }

  return {
    city_id: city.id,
    observed_at: new Date().toISOString(),
    temperature_f: current.temperature_2m,
    apparent_temperature_f: current.apparent_temperature,
    precipitation_probability: nextSixHourMax(forecast.hourly?.precipitation_probability),
    wind_speed_mph: current.wind_speed_10m ?? 0,
    weather_code: current.weather_code ?? null,
    uv_index: nextSixHourMax(forecast.hourly?.uv_index),
    summary: weatherCodeLabel(current.weather_code),
    raw: forecast
  };
}

async function fetchForecast(city: PollCity): Promise<OpenMeteoForecast> {
  const forecast = await fetchForecastUrl(createForecastUrl([city], city.timezone ?? "auto"), city.name);
  return Array.isArray(forecast) ? forecast[0] : forecast;
}

async function fetchForecasts(cities: PollCity[]): Promise<OpenMeteoForecast[]> {
  const forecast = await fetchForecastUrl(createForecastUrl(cities, "auto"), `${cities.length} cities`);

  if (!Array.isArray(forecast)) {
    throw new Error("Open-Meteo returned a single response for a multi-city request");
  }

  if (forecast.length !== cities.length) {
    throw new Error(`Open-Meteo returned ${forecast.length} responses for ${cities.length} cities`);
  }

  return forecast;
}

function createForecastUrl(cities: PollCity[], timezone: string): URL {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", cities.map((city) => String(city.latitude)).join(","));
  url.searchParams.set("longitude", cities.map((city) => String(city.longitude)).join(","));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m"
  );
  url.searchParams.set("hourly", "precipitation_probability,uv_index");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", timezone);

  return url;
}

async function fetchForecastUrl(url: URL, label: string): Promise<OpenMeteoForecast | OpenMeteoForecast[]> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(url);
    if (response.ok) {
      return (await response.json()) as OpenMeteoForecast | OpenMeteoForecast[];
    }

    if (attempt < 2 && (response.status === 429 || response.status >= 500)) {
      await delay(1500 * attempt);
      continue;
    }

    throw new Error(`Open-Meteo ${response.status} for ${label}`);
  }

  throw new Error(`Open-Meteo request failed for ${label}`);
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

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
