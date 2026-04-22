"use client";

import { useEffect, useMemo, useState } from "react";
import type { ISourceOptions } from "@tsparticles/engine";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";

type WeatherParticlesProps = {
  id: string;
  weatherCode?: number | null;
  observedAt?: string | null;
  timezone?: string | null;
};

type WeatherEffect = "calm" | "clouds" | "fog" | "rain" | "snow" | "stars" | "storm" | "sun";

let particlesEnginePromise: Promise<void> | null = null;

function ensureParticlesEngine() {
  particlesEnginePromise ??= initParticlesEngine(async (engine) => {
    await loadSlim(engine);
  });

  return particlesEnginePromise;
}

export function WeatherParticles({ id, weatherCode, observedAt, timezone }: WeatherParticlesProps) {
  const [ready, setReady] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const effect = weatherEffect(weatherCode, observedAt, timezone);
  const options = useMemo(() => particlesOptions(effect), [effect]);

  useEffect(() => {
    if (reducedMotion) return;

    let mounted = true;
    void ensureParticlesEngine().then(() => {
      if (mounted) setReady(true);
    });

    return () => {
      mounted = false;
    };
  }, [reducedMotion]);

  if (reducedMotion) {
    return <div aria-hidden="true" className={`weather-particles-static weather-particles-static-${effect}`} />;
  }

  if (!ready) return null;

  return (
    <Particles
      className="weather-particles"
      id={`weather-particles-${id}`}
      options={options}
      style={{ inset: 0, position: "absolute" }}
    />
  );
}

function particlesOptions(effect: WeatherEffect): ISourceOptions {
  const base: ISourceOptions = {
    autoPlay: true,
    background: {
      color: {
        value: "transparent"
      }
    },
    detectRetina: true,
    fpsLimit: 32,
    fullScreen: {
      enable: false
    },
    interactivity: {
      events: {
        resize: {
          enable: true
        }
      }
    },
    particles: {
      links: {
        enable: false
      },
      move: {
        enable: true,
        outModes: {
          default: "out"
        }
      }
    }
  };

  const effects: Record<WeatherEffect, ISourceOptions> = {
    calm: {
      particles: {
        color: { value: ["#356f9f", "#2f7d57"] },
        move: { direction: "none", speed: 0.2 },
        number: { value: 10 },
        opacity: { value: { min: 0.08, max: 0.18 } },
        shape: { type: "circle" },
        size: { value: { min: 2, max: 5 } }
      }
    },
    clouds: {
      particles: {
        color: { value: ["#ffffff", "#d9e1ea"] },
        move: { direction: "right", speed: 0.45, straight: false },
        number: { value: 8 },
        opacity: { value: { min: 0.1, max: 0.2 } },
        shape: { type: "circle" },
        size: { value: { min: 14, max: 34 } }
      }
    },
    fog: {
      particles: {
        color: { value: ["#ffffff", "#cbd5e1"] },
        move: { direction: "right", speed: 0.22, straight: false },
        number: { value: 10 },
        opacity: { value: { min: 0.08, max: 0.16 } },
        shape: { type: "circle" },
        size: { value: { min: 20, max: 42 } }
      }
    },
    rain: {
      particles: {
        color: { value: "#356f9f" },
        move: { direction: "bottom-right", speed: { min: 7, max: 11 }, straight: true },
        number: { value: 24 },
        opacity: { value: { min: 0.12, max: 0.24 } },
        rotate: { value: 62 },
        shape: { type: "line" },
        size: { value: { min: 5, max: 11 } },
        stroke: { color: "#356f9f", width: 1 }
      }
    },
    snow: {
      particles: {
        color: { value: ["#ffffff", "#d9e1ea"] },
        move: { direction: "bottom", speed: { min: 0.7, max: 1.8 }, straight: false },
        number: { value: 34 },
        opacity: { value: { min: 0.32, max: 0.68 } },
        shape: { type: "circle" },
        size: { value: { min: 1.4, max: 4.2 } }
      }
    },
    stars: {
      particles: {
        color: { value: ["#ffffff", "#f8fafc"] },
        move: { direction: "none", enable: false },
        number: { value: 18 },
        opacity: {
          animation: { enable: true, speed: 0.65, sync: false },
          value: { min: 0.25, max: 0.75 }
        },
        shape: { type: "star" },
        size: { value: { min: 1.2, max: 2.6 } }
      }
    },
    storm: {
      particles: {
        color: { value: ["#356f9f", "#64748b"] },
        move: { direction: "bottom-right", speed: { min: 9, max: 14 }, straight: true },
        number: { value: 22 },
        opacity: { value: { min: 0.08, max: 0.18 } },
        rotate: { value: 62 },
        shape: { type: "line" },
        size: { value: { min: 6, max: 14 } },
        stroke: { color: "#64748b", width: 1 }
      }
    },
    sun: {
      particles: {
        color: { value: ["#b87320", "#f5c451"] },
        move: { direction: "top", speed: 0.28, straight: false },
        number: { value: 16 },
        opacity: { value: { min: 0.1, max: 0.28 } },
        shape: { type: "circle" },
        size: { value: { min: 2, max: 5.5 } }
      }
    }
  };

  return deepMerge(base, effects[effect]);
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  const output: Record<string, unknown> = { ...target };

  for (const [key, value] of Object.entries(source)) {
    const current = output[key];
    output[key] =
      isPlainObject(current) && isPlainObject(value)
        ? deepMerge(current as Record<string, unknown>, value as Record<string, unknown>)
        : value;
  }

  return output as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function weatherEffect(
  weatherCode?: number | null,
  observedAt?: string | null,
  timezone?: string | null
): WeatherEffect {
  if (weatherCode === 0) return isNight(observedAt, timezone) ? "stars" : "sun";
  if (weatherCode != null && [1, 2, 3].includes(weatherCode)) return "clouds";
  if (weatherCode != null && [45, 48].includes(weatherCode)) return "fog";
  if (weatherCode != null && [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) {
    return "rain";
  }
  if (weatherCode != null && [71, 73, 75, 77, 85, 86].includes(weatherCode)) return "snow";
  if (weatherCode != null && [95, 96, 99].includes(weatherCode)) return "storm";
  return "calm";
}

function isNight(observedAt?: string | null, timezone?: string | null) {
  const date = observedAt ? new Date(observedAt) : null;
  if (!date || Number.isNaN(date.getTime())) return false;

  if (timezone && timezone !== "auto") {
    try {
      const hour = Number(
        new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          hourCycle: "h23",
          timeZone: timezone
        }).format(date)
      );
      return hour < 6 || hour >= 19;
    } catch {
      return date.getUTCHours() < 6 || date.getUTCHours() >= 19;
    }
  }

  return date.getUTCHours() < 6 || date.getUTCHours() >= 19;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const update = () => setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", update);

    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return prefersReducedMotion;
}
