# 4. Tutorial: your first feature

You'll build two features that are next on the roadmap:

- **Part A: a request detail page** at `/requests/[id]`. Citizens see their own request and its released documents. Clerks also see internal notes and unreleased documents. This is the **read** pattern.
- **Part B: a "new request" form** at `/requests/new`, for citizens. This is the **write** pattern: server action, validation, transaction and audit log.

Almost every feature you build later follows one of these two patterns.

> **Stuck?** The finished code is on the `tutorial-solution` branch. Compare your work with `git diff main tutorial-solution`, or open a single file with `git show tutorial-solution:app/src/lib/requests.ts`. Try it yourself first: you'll learn far more.

## Before you start

Use the hot-reload setup from the [cheat sheet](6-cheat-sheet.md#day-to-day-development), so the site at http://localhost:3000 updates as you save. Create a branch:

```bash
git switch -c feature/request-pages
```

---

## Part A: the request detail page

### Step 1: write the query (the data access rule)

Queries go in `src/lib/`, not in the page, so the "who may see what" rule is written once. Add this to the bottom of [app/src/lib/requests.ts](../../app/src/lib/requests.ts):

```ts
/** One request, or null if it doesn't exist or this user may not see it. */
export async function getRequestFor(user: CurrentUser, id: string) {
  const staff = isStaff(user);
  return prisma.recordsRequest.findFirst({
    // Same rule as the list: a citizen asking for someone else's request gets null.
    where: staff ? { id } : { id, requesterId: user.id },
    select: {
      id: true,
      referenceNumber: true,
      subject: true,
      description: true,
      status: true,
      submittedAt: true,
      dueAt: true,
      closedAt: true,
      requester: staff ? { select: { name: true, email: true } } : false,
      assignedClerk: staff ? { select: { name: true } } : false,
      // Citizens only see documents a clerk has released.
      documents: {
        where: staff ? {} : { isReleased: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, filename: true, sizeBytes: true, isReleased: true },
      },
    },
  });
}

/** Internal staff notes. Citizens get null, so the notes are never even loaded. */
export async function getInternalNotesFor(user: CurrentUser, requestId: string) {
  if (!isStaff(user)) return null;
  return prisma.requestNote.findMany({
    where: { requestId },
    orderBy: { createdAt: "asc" },
    select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
  });
}
```

**Why `findFirst` with `requesterId` and not `findUnique({ where: { id } })`?** If you load by ID only and check the owner later in the page, one forgotten `if` leaks someone else's request. Putting the owner in the `where` means the database never returns it in the first place. This is the single most important habit in this codebase.

**Why are notes a separate function?** You could try `notes: staff ? {...} : false` inside the first query, but TypeScript then can't tell what type `notes` has. A separate function that returns `null` for citizens is clearer and fully typed.

### Step 2: create the page

Create `app/src/app/(portal)/requests/[id]/page.tsx`. The square brackets make `id` a URL parameter.

```tsx
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
```

What's going on:

- **Two components.** The exported page returns a `<Suspense>` boundary right away. The `async` component inside does the per-request work. This is rule 1 from [chapter 2](2-how-the-portal-works.md#the-rules-of-cache-components-read-this-before-your-first-page). `params` is a Promise, so it's passed down and awaited inside the boundary.
- **`notFound()`** shows the 404 page. It's the same response whether the ID doesn't exist or belongs to someone else, so a citizen can't probe for other people's request IDs.
- **`{notes && (...)}`** renders the notes section only when `notes` isn't `null`, that is, only for staff.
- **`whitespace-pre-line`** keeps the citizen's line breaks.

### Step 3: link to it from the list

In [app/src/app/(portal)/requests/page.tsx](<../../app/src/app/(portal)/requests/page.tsx>), add `import Link from "next/link";` at the top, then wrap the subject in a link:

```tsx
<td className="px-4 py-3">
  <Link href={`/requests/${r.id}`} className="text-accent hover:underline">
    {r.subject}
  </Link>
</td>
```

Use `<Link>` instead of `<a>` for pages inside the app. It navigates without a full page reload.

### Step 4: test it as each kind of user

| Sign in as | Do this | You should see |
|---|---|---|
| `jane.citizen@example.com` | Open "City council emails about the Oak Park playground budget" | The request, "No documents released yet", **no** internal notes |
| `morgan.clerk@example.org` | Open the same request | Jane's name and email, the unreleased document marked "not released", and the internal note |
| `jane.citizen@example.com` | Copy the URL of one of Sam's requests from Morgan's view, and open it as Jane | The 404 page |
| anyone | `/requests/made-up-id` | The 404 page |

Then run `npm run typecheck` and `npm run lint`.

---

## Part B: the "new request" form

### Step 5: write the server action

Create `app/src/app/actions/requests.ts`. The `"use server"` line at the top turns every exported function into a server action.

```ts
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { dueDateFor } from "@/lib/deadlines";
import { Prisma } from "@/generated/prisma/client";

const newRequestSchema = z.object({
  subject: z.string().trim().min(5, "Give the request a short subject (5+ characters).").max(200),
  description: z
    .string()
    .trim()
    .min(20, "Describe the records you need (20+ characters).")
    .max(5000),
});

export type NewRequestState =
  | { errors?: { subject?: string[]; description?: string[] }; message?: string }
  | undefined;

export async function createRequest(
  _prev: NewRequestState,
  formData: FormData,
): Promise<NewRequestState> {
  // 1. Who is asking? Server actions are public endpoints, so always check.
  const user = await requireUser("citizen");

  // 2. Validate the input on the server, whatever the browser already checked.
  const parsed = newRequestSchema.safeParse({
    subject: formData.get("subject"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  // 3. Save the request and its audit entry together (both or neither).
  const submittedAt = new Date();
  const year = submittedAt.getUTCFullYear();
  let requestId: string | undefined;

  for (let attempt = 0; attempt < 3 && !requestId; attempt++) {
    try {
      requestId = await prisma.$transaction(async (tx) => {
        const countThisYear = await tx.recordsRequest.count({
          where: { referenceNumber: { startsWith: `PRR-${year}-` } },
        });
        const created = await tx.recordsRequest.create({
          data: {
            referenceNumber: `PRR-${year}-${String(countThisYear + 1).padStart(4, "0")}`,
            subject: parsed.data.subject,
            description: parsed.data.description,
            requesterId: user.id,
            submittedAt,
            dueAt: dueDateFor(submittedAt),
          },
          select: { id: true },
        });
        await recordAudit(
          {
            action: "request.created",
            actorId: user.id,
            entityType: "records_request",
            entityId: created.id,
            requestId: created.id,
          },
          tx,
        );
        return created.id;
      });
    } catch (error) {
      // Two people submitting at the same moment can pick the same reference
      // number. The unique index rejects the second one (P2002); try again.
      const duplicate =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!duplicate) throw error;
    }
  }

  if (!requestId) return { message: "Something went wrong. Please try again." };

  // 4. Send the citizen to their new request.
  redirect(`/requests/${requestId}`);
}
```

The four numbered steps are the same in every server action you'll write:

1. **`requireUser("citizen")`**: only citizens file requests. A clerk calling this action gets a 404.
2. **Zod validation.** The browser's `required` and `maxLength` attributes are only for convenience, since anyone can bypass them. `z.flattenError(...).fieldErrors` turns Zod's errors into `{ subject: ["message"] }`, ready for the form.
3. **A transaction** saves the request and its audit row together. The due date comes from `dueDateFor()`, so the 10-business-day rule lives in one place.
4. **`redirect()`** after success. It works by throwing a special error, so don't put it inside the `try`, or the `catch` will swallow it.

**The retry loop:** reference numbers count up per year (`PRR-2026-0008`). If two citizens submit at the same moment, both can count 7 and try to use `0008`. The `@unique` index on `referenceNumber` rejects the second one with Prisma error code `P2002`, and the loop tries again with a fresh count. Let the database enforce rules like this instead of hoping they never collide.

### Step 6: build the form (a Client Component)

The form needs `useActionState` to show errors and a "Submitting…" state, so it's a Client Component. Create `app/src/app/(portal)/requests/new/new-request-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createRequest } from "@/app/actions/requests";

const input =
  "w-full rounded border border-line bg-surface px-3 py-2 focus:outline-2 focus:outline-accent";

export function NewRequestForm() {
  const [state, formAction, pending] = useActionState(createRequest, undefined);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-line bg-surface p-6">
      <div className="space-y-1">
        <label htmlFor="subject" className="block text-sm font-medium">
          Subject
        </label>
        <input id="subject" name="subject" required maxLength={200} className={input} />
        {state?.errors?.subject && <p className="text-sm text-danger">{state.errors.subject[0]}</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor="description" className="block text-sm font-medium">
          Records you need
        </label>
        <textarea id="description" name="description" required rows={6} maxLength={5000} className={input} />
        {state?.errors?.description && (
          <p className="text-sm text-danger">{state.errors.description[0]}</p>
        )}
      </div>
      {state?.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}
```

- Each input's `name` must match what the action reads with `formData.get(...)`.
- `useActionState(createRequest, undefined)` gives you `state` (whatever the action last returned), `formAction` (pass it to `<form action>`) and `pending`.
- A Client Component may **import** a server action. Calling it sends the form to the server; the action's code never reaches the browser.

### Step 7: create the page

Create `app/src/app/(portal)/requests/new/page.tsx`. It's a Server Component that checks the role, then renders the form:

```tsx
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
```

The heading and intro sit outside `<Suspense>`, so they're part of the instant static shell. Only the role check waits for the request.

### Step 8: add a "New request" button for citizens

In `requests/page.tsx`, next to the `<h1>`:

```tsx
{!staff && (
  <Link
    href="/requests/new"
    className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-strong"
  >
    New request
  </Link>
)}
```

### Step 9: test it

| Do this | Expect |
|---|---|
| As Jane, submit "Hi" / "short" | Both fields show an error, and nothing is saved |
| As Jane, submit a real subject and description | You land on the new request's page with a new `PRR-...` number, status Submitted, due 10 business days from today |
| Go back to "My requests" | The new request is in the list |
| As Morgan, open `/requests/new` | The 404 page |
| Check the audit log (see [chapter 3](3-database.md#looking-at-the-data-directly)) | A new `request.created` row with Jane as the actor |

```sql
SELECT action, actor_id, created_at FROM audit_logs ORDER BY id DESC LIMIT 3;
```

Finally, run `npm run typecheck`, `npm run lint` and `npm run build`, then commit.

---

## The checklist for every feature

Copy this into your pull request description:

- [ ] Queries live in `src/lib/` and filter by what the user may see (`where: { requesterId: user.id }`).
- [ ] Every page and server action that needs a user calls `requireUser()` with the right roles.
- [ ] Server actions validate input with Zod. Browser checks don't count.
- [ ] Changes write an audit entry with `recordAudit()`, in the same transaction.
- [ ] Anything that reads the user, the database, cookies or URL parameters is inside `<Suspense>`.
- [ ] `select` picks only the fields the page needs. No `passwordHash` or staff-only data reaches citizen pages.
- [ ] Tested as a citizen, a clerk and a signed-out visitor.
- [ ] `npm run typecheck`, `npm run lint` and `npm run build` pass.
- [ ] Schema changes include their migration, and the seed data is updated if useful.

## Ideas for your next feature

From the roadmap, roughly easiest first:

1. **Clerk assigns a request to themselves.** A button on the detail page, a server action that requires `"clerk", "admin"`, an `update`, and a `request.assigned` audit entry.
2. **Clerk adds an internal note.** A textarea, a `create` on `requestNote`, and a `note.added` audit entry.
3. **Clerk changes the status.** Set `closedAt` when the status becomes `fulfilled` or `denied`, and record `{ from, to }` in the audit metadata.
4. **An admin audit-log page.** A read-only table of recent `audit_logs` rows.
5. **Email the citizen when the status changes** by calling the integration service (see [chapter 5](5-integration-service.md)).

**Next:** [5. The integration service](5-integration-service.md)
