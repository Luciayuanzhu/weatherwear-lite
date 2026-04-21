import type { Sensitivity, TempUnit } from "@weatherwear/shared";

export type City = {
  id: string;
  slug: string;
  name: string;
  country: string;
  admin1: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  is_default: boolean;
};

export type WeatherReport = {
  city_id: string;
  observed_at: string;
  temperature_f: number;
  apparent_temperature_f: number;
  precipitation_probability: number;
  wind_speed_mph: number;
  weather_code: number | null;
  uv_index: number | null;
  summary: string;
  updated_at: string;
};

export type UserPreferences = {
  user_id: string;
  temp_unit: TempUnit;
  sensitivity: Sensitivity;
};

export type WorkerRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "error";
  cities_polled: number;
  error_message: string | null;
};

