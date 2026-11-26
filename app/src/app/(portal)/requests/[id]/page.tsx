import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getInternalNotesFor, getRequestFor } from "@/lib/requests";
import { isOverdue } from "@/lib/deadlines";
import { OverdueBadge, StatusBadge } from "@/components/badges";

export const metadata: Metadata = { title: "Request" };

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default function RequestDetailPage({ params }: PageProps<"/requests/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading request…</p>}>
      <RequestDetail params={params} />
    </Suspense>
  );
}

async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const request = await getRequestFor(user, id);
  // Same 404 whether it doesn't exist or belongs to someone else.
  if (!request) notFound();
  const notes = await getInternalNotesFor(user, request.id);

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs text-muted">{request.referenceNumber}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{request.subject}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={request.status} />
          {isOverdue(request) && <OverdueBadge />}
          <span className="text-muted">
            Submitted {dateFmt.format(request.submittedAt)} ·{" "}
            {request.closedAt
              ? `Closed ${dateFmt.format(request.closedAt)}`
              : `Due ${dateFmt.format(request.dueAt)}`}
          </span>
        </div>
      </header>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Request</h2>
        <p className="whitespace-pre-line">{request.description}</p>
        {request.requester && (
          <p className="mt-3 text-sm text-muted">
            From {request.requester.name} ({request.requester.email}) · Assigned to{" "}
            {request.assignedClerk?.name ?? "nobody yet"}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Documents</h2>
        {request.documents.length === 0 ? (
          <p className="text-muted">No documents released yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {request.documents.map((d) => (
              <li key={d.id} className="flex justify-between gap-4 px-4 py-3 text-sm">
                <span>{d.filename}</span>
                <span className="text-muted">
                  {(d.sizeBytes / 1024).toFixed(0)} KB{!d.isReleased && " · not released"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {notes && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Internal notes</h2>
          {notes.length === 0 ? (
            <p className="text-muted">No notes.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg border border-line bg-surface p-3 text-sm">
                  <p>{n.body}</p>
                  <p className="mt-1 text-xs text-muted">
                    {n.author.name} · {dateFmt.format(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </article>
  );
}
