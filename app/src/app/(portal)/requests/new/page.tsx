import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isStaff, requireUser } from "@/lib/dal";
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
  // Staff can land here from the home page's "Start a request" button (via the
  // login redirect). This page is public knowledge, so instead of a 404, send
  // them to the request list they work from.
  const user = await requireUser();
  if (isStaff(user)) redirect("/requests");
  return <NewRequestForm />;
}
