import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser, isStaff } from "@/lib/dal";
import { listRequestsFor } from "@/lib/requests";
import { isOverdue } from "@/lib/deadlines";
import { OverdueBadge, StatusBadge } from "@/components/badges";

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
        <h1 className="text-2xl font-semibold tracking-tight">{staff ? "All requests" : "My requests"}</h1>
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
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{r.referenceNumber}</td>
                  <td className="px-4 py-3">{r.subject}</td>
                  {staff && <td className="whitespace-nowrap px-4 py-3">{r.requester?.name}</td>}
                  {staff && (
                    <td className="whitespace-nowrap px-4 py-3">
                      {r.assignedClerk?.name ?? <span className="text-muted">Unassigned</span>}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      <StatusBadge status={r.status} />
                      {isOverdue(r, now) && <OverdueBadge />}
                    </span>
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
