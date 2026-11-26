import type { Metadata } from "next";
import { Suspense } from "react";
import { HeroSection } from "@/components/hero-section";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <HeroSection className="items-center justify-center">
      <div className="w-full max-w-sm px-4 py-16">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-signal-teal">
          Public records portal
        </p>
        <h1 className="mb-6 mt-3 text-3xl font-semibold tracking-tight">Sign in</h1>
        {/* The form reads ?callbackUrl= from the URL, which is request-time data. */}
        <Suspense>
          <LoginForm />
        </Suspense>
        <p className="mt-6 text-sm text-hero-muted">
          Demo accounts are listed in the project README. All data is fake.
        </p>
      </div>
    </HeroSection>
  );
}
