"use client";

import { useMemo, useSyncExternalStore } from "react";
import Particles, { ParticlesProvider } from "@tsparticles/react";
import type {
  Engine,
  IShapeDrawData,
  IShapeDrawer,
  ISourceOptions,
  Particle,
} from "@tsparticles/engine";
import { loadSlim } from "@tsparticles/slim";

// Animated lightning drawn with tsParticles. Each particle is one bolt: it
// flickers for a split second, vanishes, then strikes again somewhere else.

/** Bolt colors: white, yellow, teal. */
export const BOLT_COLORS = ["#ffffff", "#facc15", "#2dd4bf"];

type Point = [x: number, y: number];
type Bolt = Point[][]; // a main channel plus forks, each a list of points

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * A jagged bolt in unit space: x around 0, y from -1 (top) to 1 (bottom).
 * The shape drawer scales it by the particle's radius.
 */
function createBolt(): Bolt {
  const steps = Math.round(rand(9, 14));
  const main: Point[] = [[0, -1]];
  let x = 0;
  for (let i = 1; i <= steps; i++) {
    x = Math.max(-0.45, Math.min(0.45, x + rand(-0.2, 0.2)));
    main.push([x, -1 + (2 * i) / steps]);
  }

  const forks: Point[][] = [];
  const forkCount = Math.round(rand(1, 3));
  for (let f = 0; f < forkCount; f++) {
    const start = main[Math.round(rand(2, steps - 3))];
    const side = Math.random() < 0.5 ? -1 : 1;
    const fork: Point[] = [start];
    let [fx, fy] = start;
    const forkSteps = Math.round(rand(3, 5));
    for (let i = 0; i < forkSteps && fy < 1; i++) {
      fx += side * rand(0.08, 0.22);
      fy += rand(0.08, 0.18);
      fork.push([fx, Math.min(fy, 1)]);
    }
    forks.push(fork);
  }
  return [main, ...forks];
}

/** Custom tsParticles shape named "lightning". */
class LightningDrawer implements IShapeDrawer {
  // One bolt per particle, regenerated whenever the particle re-strikes
  // somewhere new (the life updater moves it to a random position).
  #bolts = new WeakMap<Particle, { x: number; y: number; bolt: Bolt }>();

  #boltFor(particle: Particle): Bolt {
    const { x, y } = particle.position;
    const cached = this.#bolts.get(particle);
    if (cached && cached.x === x && cached.y === y) return cached.bolt;
    const bolt = createBolt();
    this.#bolts.set(particle, { x, y, bolt });
    return bolt;
  }

  beforeDraw({ context }: IShapeDrawData) {
    // A soft glow in the bolt's own color.
    context.shadowColor =
      typeof context.strokeStyle === "string" ? context.strokeStyle : "#ffffff";
    context.shadowBlur = 18;
    context.lineJoin = "round";
    context.lineCap = "round";
  }

  draw({ context, particle, radius }: IShapeDrawData) {
    for (const path of this.#boltFor(particle)) {
      context.moveTo(path[0][0] * radius, path[0][1] * radius);
      for (const [px, py] of path.slice(1)) context.lineTo(px * radius, py * radius);
    }
  }

  afterDraw({ context }: IShapeDrawData) {
    context.shadowBlur = 0; // don't leak the glow into the next particle
  }
}

// Must be defined once at module level: ParticlesProvider requires the same
// init function for the app's whole lifetime.
async function loadEngine(engine: Engine) {
  await loadSlim(engine);
  await engine.pluginManager.register((e) => {
    e.pluginManager.addShape(["lightning"], () => Promise.resolve(new LightningDrawer()));
  });
}

function buildOptions(reduceMotion: boolean): ISourceOptions {
  return {
    fullScreen: { enable: false }, // fill the parent element, not the window
    background: { color: "transparent" },
    fpsLimit: 60,
    detectRetina: true,
    pauseOnBlur: true,
    pauseOnOutsideViewport: true,
    particles: {
      // About 2 bolts are visible at any moment (each is lit ~10% of its cycle).
      number: { value: reduceMotion ? 8 : 20, density: { enable: false } },
      shape: { type: "lightning", close: false }, // open paths: don't join the ends
      paint: {
        fill: { enable: false },
        stroke: { width: { min: 1.5, max: 3.2 }, color: { value: BOLT_COLORS }, opacity: 1 },
      },
      size: { value: { min: 70, max: 220 } }, // half the bolt's height, in pixels
      rotate: { value: { min: -25, max: 25 } }, // slight tilt, in degrees
      move: { enable: false },
      opacity: reduceMotion
        ? { value: 0.3 }
        : // Fast random flicker while a bolt is visible.
          { value: { min: 0.45, max: 1 }, animation: { enable: true, speed: 12, sync: false } },
      // Strike cycle, in seconds: hidden for `delay`, visible for `duration`, then the
      // bolt moves to a random spot and waits again. Skipped for reduced motion,
      // which shows a few faint, still bolts instead of flashing ones.
      ...(reduceMotion
        ? {}
        : {
            life: {
              count: 0, // repeat forever
              delay: { value: { min: 0.3, max: 3.5 }, sync: false },
              duration: { value: { min: 0.1, max: 0.35 }, sync: false },
            },
          }),
    },
  };
}

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Honors the OS "reduce motion" setting: no flashing, just faint still bolts. */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false, // server render
  );
}

export function LightningField({ id, className }: { id: string; className?: string }) {
  const reduceMotion = usePrefersReducedMotion();
  // Rebuilding options restarts the animation, so only do it when the setting changes.
  const options = useMemo(() => buildOptions(reduceMotion), [reduceMotion]);

  return (
    <ParticlesProvider init={loadEngine}>
      <Particles id={id} className={className} options={options} />
    </ParticlesProvider>
  );
}
