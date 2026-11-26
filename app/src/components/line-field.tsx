"use client";

import { useMemo, useSyncExternalStore } from "react";
import Particles, { ParticlesProvider } from "@tsparticles/react";
import type { Engine, ISourceOptions } from "@tsparticles/engine";
import { loadSlim } from "@tsparticles/slim";

// Animated background of drifting line fragments, drawn with tsParticles.
// Each particle is a short line rotated to face the way it travels.

// Brand colors for the fragments: white, yellow, teal.
export const LINE_COLORS = ["#ffffff", "#facc15", "#2dd4bf"];

// Must be defined once at module level: ParticlesProvider requires the same
// init function for the app's whole lifetime.
async function loadEngine(engine: Engine) {
  await loadSlim(engine);
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
      // Scaled by screen area, so phones get fewer; high enough that they still show plenty.
      number: { value: 130, density: { enable: true } },
      shape: { type: "line" },
      paint: {
        fill: { enable: false },
        stroke: { width: { min: 1, max: 2.5 }, color: { value: LINE_COLORS }, opacity: 1 },
      },
      // `size` is half the line's length.
      size: { value: { min: 3, max: 42 } },
      opacity: {
        value: { min: 0.15, max: 0.85 },
        animation: { enable: !reduceMotion, speed: 0.6, sync: false },
      },
      // Point each line along its direction of travel.
      rotate: { path: true },
      move: {
        enable: !reduceMotion,
        direction: "top-right",
        angle: { value: 18, offset: 0 }, // spread around the main direction
        speed: { min: 0.6, max: 3.2 },
        straight: false,
        outModes: { default: "out" },
      },
    },
  };
}

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Honors the OS "reduce motion" setting: the lines stay put instead of moving. */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false, // server render
  );
}

export function LineField({ className }: { className?: string }) {
  const reduceMotion = usePrefersReducedMotion();
  // Rebuilding options restarts the animation, so only do it when the setting changes.
  const options = useMemo(() => buildOptions(reduceMotion), [reduceMotion]);

  return (
    <ParticlesProvider init={loadEngine}>
      <Particles id="home-line-field" className={className} options={options} />
    </ParticlesProvider>
  );
}
