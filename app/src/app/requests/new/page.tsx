import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/dal";
import { RESPONSE_BUSINESS_DAYS } from "@/lib/deadlines";
import { NewRequestForm } from "./new-request-form";

export const metadata: Metadata = { title: "New request" };

export default function NewRequestPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">New records request</h1>
      <p className="text-muted">
        Describe the records you need. The city must respond within {RESPONSE_BUSINESS_DAYS}{" "}
        business days.
      </p>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <CitizenOnly />
      </Suspense>
    </div>
  );
}

// Checks the role before showing the form (the action checks again on submit).
async function CitizenOnly() {
  await requireUser("citizen");
  return <NewRequestForm />;
}
