import Link from "next/link";
import { StormSection } from "@/components/storm-section";
import { RESPONSE_BUSINESS_DAYS } from "@/lib/deadlines";

const steps = [
  {
    title: "Describe what you need",
    body: "Sign in and tell us which records you're after: police reports, permits, contracts or emails.",
    accent: "bg-white",
  },
  {
    title: "Track it as it's reviewed",
    body: `A records clerk reviews every request, and the city must respond within ${RESPONSE_BUSINESS_DAYS} business days.`,
    accent: "bg-signal-yellow",
  },
  {
    title: "Get your documents",
    body: "Download the records as soon as the clerk releases them. Every step is logged.",
    accent: "bg-signal-teal",
  },
];

export default function HomePage() {
  return (
    <StormSection id="home-lightning" className="items-center">
      <div className="mx-auto w-full max-w-5xl px-4 py-20 sm:py-28">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-signal-teal">
          Public records portal
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Request public records.{" "}
          <span className="text-signal-yellow">Track every step.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-hero-muted">
          Ask your city for the records you have a right to see. A clerk reviews each request, and
          the city must respond within {RESPONSE_BUSINESS_DAYS} business days.
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/requests/new"
            className="rounded bg-signal-teal px-5 py-3 font-semibold text-hero hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Start a request
          </Link>
          <Link
            href="/requests"
            className="rounded border border-white/40 px-5 py-3 font-semibold text-white hover:border-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Track my requests
          </Link>
        </div>

        <ol className="mt-16 grid gap-4 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="rounded-lg border border-white/10 bg-hero/70 p-5 backdrop-blur-sm"
            >
              <span aria-hidden className={`mb-4 block h-0.5 w-10 ${step.accent}`} />
              <p className="font-mono text-xs text-hero-muted">0{i + 1}</p>
              <h2 className="mt-1 font-semibold">{step.title}</h2>
              <p className="mt-2 text-sm text-hero-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </StormSection>
  );
}
