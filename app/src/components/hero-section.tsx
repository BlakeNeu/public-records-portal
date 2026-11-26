import type { ReactNode } from "react";

/**
 * Full-width dark section used by the home and login pages.
 * `full-bleed` tells the root layout to drop its width limit and padding.
 */
export function HeroSection({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`full-bleed flex flex-1 bg-hero text-white ${className}`}>
      {children}
    </section>
  );
}
