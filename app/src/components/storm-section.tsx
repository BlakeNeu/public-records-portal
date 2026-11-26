import type { ReactNode } from "react";
import { LightningField } from "@/components/lightning-field";

/**
 * Full-width dark section with animated lightning behind its content.
 * Used by the home and login pages. `full-bleed` tells the root layout to
 * drop its width limit and padding for this page.
 */
export function StormSection({
  id,
  className = "",
  children,
}: {
  id: string; // unique per page; names the animation's container element
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`full-bleed relative isolate flex flex-1 overflow-hidden bg-hero text-white ${className}`}
    >
      <LightningField id={id} className="absolute inset-0 -z-20" />
      {/* Darkens the middle so text stays readable over the bolts. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(15,18,22,0.85)_0%,rgba(15,18,22,0.45)_45%,rgba(15,18,22,0)_80%)]"
      />
      {children}
    </section>
  );
}
