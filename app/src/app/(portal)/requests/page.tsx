import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requireUser, isStaff } from "@/lib/dal";
import { listRequestsFor } from "@/lib/requests";
import { isOverdue } from "@/lib/deadlines";
import { StatusBadge } from "@/components/badges";

export const metadata: Metadata = { title: "Requests" };

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default function RequestsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading requests…</p>}>
      <RequestsTable />
    </Suspense>
  );
}

async function RequestsTable() {
  const user = await requireUser();
  const staff = isStaff(user);
  const requests = await listRequestsFor(user);
  const now = new Date();
  const overdueCount = requests.filter((r) => isOverdue(r, now)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {!staff && (
            <Link
              href="/requests/new"
              // Icon-only, so the label gives screen readers (and the hover tooltip) a name.
              aria-label="New request"
              title="New request"
              className="inline-flex items-center gap-1.5 rounded bg-background px-3 py-1.5 text-sm font-medium text-foreground ring-1 ring-line hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <path d="M8 3v10M3 8h10" />
              </svg>
            </Link>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">{staff ? "All requests" : "My requests"}</h1>
        </div>
        {staff && overdueCount > 0 && (
          <p className="text-sm font-medium text-danger">
            {overdueCount} {overdueCount === 1 ? "request is" : "requests are"} past due
          </p>
        )}
      </div>

      {requests.length === 0 ? (
        <p className="text-muted">No requests yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">Reference</th>
                <th scope="col" className="px-4 py-3">Subject</th>
                {staff && <th scope="col" className="px-4 py-3">Requester</th>}
                {staff && <th scope="col" className="px-4 py-3">Assigned</th>}
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {requests.map((r) => (
                <tr key={r.id}>
                  {/* Past-due requests show their reference in red. Color alone isn't
                      announced by screen readers, so they also get hidden text. */}
                  <td
                    className={`whitespace-nowrap px-4 py-3 font-mono text-xs ${isOverdue(r, now) ? "font-semibold text-danger" : ""}`}
                  >
                    {r.referenceNumber}
                    {isOverdue(r, now) && <span className="sr-only"> (overdue)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/requests/${r.id}`} className="text-accent hover:underline">
                      {r.subject}
                    </Link>
                  </td>
                  {staff && <td className="whitespace-nowrap px-4 py-3">{r.requester?.name}</td>}
                  {staff && (
                    <td className="whitespace-nowrap px-4 py-3">
                      {r.assignedClerk?.name ?? <span className="text-muted">Unassigned</span>}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {r.closedAt ? (
                      <span className="text-muted">Closed {dateFmt.format(r.closedAt)}</span>
                    ) : (
                      dateFmt.format(r.dueAt)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
