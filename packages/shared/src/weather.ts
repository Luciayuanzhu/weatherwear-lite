export type TempUnit = "fahrenheit" | "celsius";
export type Sensitivity = "runs_cold" | "balanced" | "runs_warm";

export type WeatherInputs = {
  temperatureF: number;
  apparentTemperatureF: number;
  rainProbability: number;
  windSpeedMph: number;
  uvIndex?: number | null;
  weatherCode?: number | null;
  sensitivity?: Sensitivity;
};

export type WeatherAdvice = {
  outfit: string;
  umbrella: string;
  comfort: string;
  score: number;
};

export function fahrenheitToCelsius(value: number): number {
  return (value - 32) * (5 / 9);
}

export function formatTemperature(valueF: number, unit: TempUnit): string {
  const value = unit === "celsius" ? fahrenheitToCelsius(valueF) : valueF;
  const suffix = unit === "celsius" ? "C" : "F";
  return `${Math.round(value)} deg ${suffix}`;
}

export function formatWind(valueMph: number): string {
  return `${Math.round(valueMph)} mph`;
}

export function weatherCodeLabel(code?: number | null): string {
  if (code == null) return "Weather";
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Storms";
  return "Weather";
}

export function buildWeatherAdvice(inputs: WeatherInputs): WeatherAdvice {
  const sensitivity = inputs.sensitivity ?? "balanced";
  const apparent = inputs.apparentTemperatureF + sensitivityOffset(sensitivity);
  const wind = inputs.windSpeedMph;
  const rain = inputs.rainProbability;
  const uv = inputs.uvIndex ?? 0;

  let outfit = "Comfortable layers";
  if (apparent <= 25) outfit = "Heavy coat, hat, and gloves";
  else if (apparent <= 40) outfit = "Warm coat";
  else if (apparent <= 55) outfit = "Jacket or fleece";
  else if (apparent <= 68) outfit = "Light jacket";
  else if (apparent >= 85) outfit = "Light breathable clothes";

  if (wind >= 22 && apparent <= 60) {
    outfit = `${outfit}; wind-resistant layer`;
  }

  let umbrella = "No umbrella needed";
  if (rain >= 55) umbrella = "Bring an umbrella";
  else if (rain >= 30) umbrella = "Pack a compact umbrella";

  let comfort = "Good for being out";
  if (rain >= 65 || wind >= 28 || apparent <= 20 || apparent >= 95) {
    comfort = "Plan around the weather";
  } else if (rain >= 35 || wind >= 18 || apparent <= 35 || apparent >= 86) {
    comfort = "Manageable with a little prep";
  }

  if (uv >= 7 && apparent >= 65) {
    comfort = `${comfort}; sunscreen helps`;
  }

  return {
    outfit,
    umbrella,
    comfort,
    score: comfortScore({ ...inputs, apparentTemperatureF: apparent })
  };
}

export function comfortScore(inputs: WeatherInputs): number {
  let score = 100;
  const apparent = inputs.apparentTemperatureF;

  if (apparent < 68) score -= Math.min(35, (68 - apparent) * 0.9);
  if (apparent > 76) score -= Math.min(35, (apparent - 76) * 1.1);
  score -= Math.min(25, inputs.rainProbability * 0.25);
  score -= Math.max(0, inputs.windSpeedMph - 10) * 0.8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function sensitivityOffset(sensitivity: Sensitivity): number {
  if (sensitivity === "runs_cold") return -6;
  if (sensitivity === "runs_warm") return 5;
  return 0;
}

