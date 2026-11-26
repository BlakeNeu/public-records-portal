import type { ReactNode } from "react";

/** Full-width dark section used by the home and login pages. */
export function HeroSection({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex flex-1 bg-hero text-white ${className}`}>
      {children}
    </section>
  );
}
