"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type WeatherAtmosphereProps = {
  id: string;
  weatherCode?: number | null;
  observedAt?: string | null;
  timezone?: string | null;
};

type WeatherEffect = "calm" | "clouds" | "fog" | "rain" | "snow" | "stars" | "storm" | "sun";

type Particle = {
  x: number;
  y: number;
  alpha: number;
  drift: number;
  length: number;
  phase: number;
  radius: number;
  speed: number;
};

type Scene = {
  dust: Particle[];
  rain: Particle[];
  snow: Particle[];
  stars: Particle[];
};

export function WeatherAtmosphere({ id, weatherCode, observedAt, timezone }: WeatherAtmosphereProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const effect = weatherEffect(weatherCode, observedAt, timezone);
  const scene = useMemo(() => createScene(`${id}-${effect}`), [id, effect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let animationFrame = 0;
    let lastDraw = 0;
    let width = 0;
    let height = 0;
    const startedAt = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const render = (now: number) => {
      if (!reducedMotion && now - lastDraw < 33) {
        animationFrame = requestAnimationFrame(render);
        return;
      }

      lastDraw = now;
      const time = reducedMotion ? 0 : (now - startedAt) / 1000;
      drawScene(context, width, height, effect, scene, time);

      if (!reducedMotion) {
        animationFrame = requestAnimationFrame(render);
      }
    };

    render(performance.now());

    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
    };
  }, [effect, reducedMotion, scene]);

  return <canvas aria-hidden="true" className="weather-atmosphere" ref={canvasRef} />;
}

function drawScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  effect: WeatherEffect,
  scene: Scene,
  time: number
) {
  context.clearRect(0, 0, width, height);
  drawSky(context, width, height, effect, time);

  if (effect === "sun") {
    drawSun(context, width, height, time);
    drawFloatingDust(context, width, height, scene.dust, time, "#d69a37");
  }

  if (effect === "stars") {
    drawStars(context, width, height, scene.stars, time);
  }

  if (effect === "clouds" || effect === "rain" || effect === "storm" || effect === "fog") {
    drawCloudLayer(context, width, height, time, effect);
  }

  if (effect === "fog") {
    drawFog(context, width, height, time);
  }

  if (effect === "rain" || effect === "storm") {
    drawRain(context, width, height, scene.rain, time, effect === "storm");
  }

  if (effect === "storm") {
    drawLightning(context, width, height, time);
  }

  if (effect === "snow") {
    drawCloudLayer(context, width, height, time, "clouds");
    drawSnow(context, width, height, scene.snow, time);
  }

  if (effect === "calm") {
    drawFloatingDust(context, width, height, scene.dust.slice(0, 12), time, "#7aa6bd");
  }
}

function drawSky(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  effect: WeatherEffect,
  time: number
) {
  const palette: Record<WeatherEffect, [string, string, string]> = {
    calm: ["#f6fbff", "#eaf6fb", "#f7fbf8"],
    clouds: ["#edf5fb", "#e3edf5", "#fbfdff"],
    fog: ["#edf3f7", "#e7edf3", "#fbfdff"],
    rain: ["#e7f0f7", "#dce9f2", "#f7fbff"],
    snow: ["#f8fcff", "#e6f2fb", "#ffffff"],
    stars: ["#eaf0fa", "#dce8f5", "#f8fbff"],
    storm: ["#dfe9f2", "#d5e1ec", "#f3f7fb"],
    sun: ["#fff0c9", "#e9f7ff", "#ffffff"]
  };

  const [top, middle, bottom] = palette[effect];
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, top);
  gradient.addColorStop(0.55, middle);
  gradient.addColorStop(1, bottom);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(
    width * (effect === "stars" ? 0.22 : 0.82),
    height * 0.18,
    0,
    width * (effect === "stars" ? 0.22 : 0.82),
    height * 0.18,
    Math.max(width, height) * 0.78
  );
  const glowColor = effect === "sun" ? "rgba(245, 181, 73," : effect === "storm" ? "rgba(84, 105, 128," : "rgba(96, 148, 188,";
  const pulse = 0.02 * Math.sin(time * 0.8);
  glow.addColorStop(0, `${glowColor}${0.22 + pulse})`);
  glow.addColorStop(0.48, `${glowColor}${0.08 + pulse})`);
  glow.addColorStop(1, `${glowColor}0)`);
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

function drawSun(context: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const x = width * 0.82;
  const y = height * 0.18;
  const radius = Math.min(width, height) * 0.18;
  const glow = context.createRadialGradient(x, y, 0, x, y, radius * 2.9);
  glow.addColorStop(0, "rgba(255, 211, 122, 0.58)");
  glow.addColorStop(0.28, "rgba(255, 215, 134, 0.3)");
  glow.addColorStop(1, "rgba(255, 215, 134, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.translate(x, y);
  context.rotate(Math.sin(time * 0.15) * 0.05);
  context.strokeStyle = "rgba(240, 178, 73, 0.12)";
  context.lineWidth = 1;
  for (let index = 0; index < 10; index += 1) {
    const angle = (Math.PI * 2 * index) / 10;
    context.beginPath();
    context.moveTo(Math.cos(angle) * radius * 0.8, Math.sin(angle) * radius * 0.8);
    context.lineTo(Math.cos(angle) * radius * 2.2, Math.sin(angle) * radius * 2.2);
    context.stroke();
  }
  context.restore();
}

function drawCloudLayer(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  effect: WeatherEffect
) {
  const opacity = effect === "fog" ? 0.25 : effect === "storm" ? 0.25 : 0.21;
  const cloudColor = effect === "storm" ? "rgba(131, 146, 163," : "rgba(255, 255, 255,";

  context.save();
  context.filter = `blur(${Math.max(8, width * 0.02)}px)`;

  for (let index = 0; index < 3; index += 1) {
    const y = height * (0.05 + index * 0.2);
    const drift = ((time * (8 + index * 4)) % (width * 1.4)) - width * 0.3;
    const x = width * (0.15 + index * 0.22) + drift * 0.08;
    context.fillStyle = `${cloudColor}${opacity - index * 0.025})`;
    drawCloud(context, x, y, width * (0.26 + index * 0.05), height * (0.21 + index * 0.025));
  }

  context.restore();
}

function drawCloud(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  context.beginPath();
  context.ellipse(x, y + height * 0.42, width * 0.42, height * 0.35, 0, 0, Math.PI * 2);
  context.ellipse(x + width * 0.32, y + height * 0.28, width * 0.34, height * 0.32, 0, 0, Math.PI * 2);
  context.ellipse(x + width * 0.68, y + height * 0.44, width * 0.46, height * 0.38, 0, 0, Math.PI * 2);
  context.fill();
}

function drawFog(context: CanvasRenderingContext2D, width: number, height: number, time: number) {
  context.save();
  context.filter = "blur(10px)";
  for (let index = 0; index < 4; index += 1) {
    const y = height * (0.18 + index * 0.17);
    const offset = Math.sin(time * 0.25 + index) * width * 0.08;
    const gradient = context.createLinearGradient(-width * 0.2 + offset, y, width * 1.2 + offset, y);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.34)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(-width * 0.2 + offset, y, width * 1.4, height * 0.1);
  }
  context.restore();
}

function drawRain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  particles: Particle[],
  time: number,
  storm: boolean
) {
  context.save();
  context.lineCap = "round";
  context.lineWidth = storm ? 1.1 : 0.9;

  for (const particle of particles) {
    const speed = storm ? particle.speed * 1.3 : particle.speed;
    const x = ((particle.x * width + time * speed * 18) % (width + 60)) - 30;
    const y = ((particle.y * height + time * speed * 34) % (height + 70)) - 35;
    const length = particle.length * (storm ? 1.2 : 1);
    const alpha = particle.alpha * (storm ? 0.85 : 0.72);
    const gradient = context.createLinearGradient(x, y, x + length * 0.4, y + length);
    gradient.addColorStop(0, `rgba(63, 102, 137, 0)`);
    gradient.addColorStop(0.55, `rgba(63, 102, 137, ${alpha})`);
    gradient.addColorStop(1, `rgba(63, 102, 137, 0)`);
    context.strokeStyle = gradient;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length * 0.42, y + length);
    context.stroke();
  }

  context.restore();
}

function drawSnow(context: CanvasRenderingContext2D, width: number, height: number, particles: Particle[], time: number) {
  context.save();
  for (const particle of particles) {
    const wobble = Math.sin(time * particle.drift + particle.phase) * 10;
    const x = (particle.x * width + wobble) % width;
    const y = (particle.y * height + time * particle.speed * 11) % (height + 12);
    context.fillStyle = `rgba(255,255,255,${particle.alpha})`;
    context.beginPath();
    context.arc(x, y, particle.radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawStars(context: CanvasRenderingContext2D, width: number, height: number, particles: Particle[], time: number) {
  context.save();
  for (const particle of particles) {
    const twinkle = 0.55 + Math.sin(time * 1.2 + particle.phase) * 0.28;
    context.fillStyle = `rgba(255,255,255,${particle.alpha * twinkle})`;
    context.beginPath();
    context.arc(particle.x * width, particle.y * height, particle.radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawFloatingDust(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  particles: Particle[],
  time: number,
  color: string
) {
  const rgb = hexToRgb(color);
  context.save();
  for (const particle of particles) {
    const x = (particle.x * width + Math.sin(time * particle.drift + particle.phase) * 12) % width;
    const y = (particle.y * height - time * particle.speed * 4 + height) % height;
    context.fillStyle = `rgba(${rgb},${particle.alpha})`;
    context.beginPath();
    context.arc(x, y, particle.radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawLightning(context: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const cycle = time % 9;
  if (cycle < 7.8 || cycle > 8.1) return;

  const alpha = cycle < 7.9 ? 0.08 : 0.04;
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
  gradient.addColorStop(0.42, `rgba(177,199,225,${alpha * 0.6})`);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function createScene(seedText: string): Scene {
  const random = seededRandom(hash(seedText));
  const particle = (): Particle => ({
    alpha: randomRange(random, 0.18, 0.54),
    drift: randomRange(random, 0.5, 1.6),
    length: randomRange(random, 14, 34),
    phase: randomRange(random, 0, Math.PI * 2),
    radius: randomRange(random, 0.8, 3.1),
    speed: randomRange(random, 0.45, 2.8),
    x: random(),
    y: random()
  });

  return {
    dust: Array.from({ length: 22 }, particle),
    rain: Array.from({ length: 34 }, particle),
    snow: Array.from({ length: 42 }, particle),
    stars: Array.from({ length: 24 }, particle)
  };
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

function hash(value: string) {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return output >>> 0;
}

function seededRandom(seed: number) {
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomRange(random: () => number, min: number, max: number) {
  return min + (max - min) * random();
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`;
}
