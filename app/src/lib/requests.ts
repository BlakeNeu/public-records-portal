import "server-only";
import { prisma } from "@/lib/prisma";
import { isStaff, type CurrentUser } from "@/lib/dal";

// Request queries live here so the "who can see what" rule is written once.
// Citizens only ever see their own requests; clerks and admins see all.

export async function listRequestsFor(user: CurrentUser) {
  return prisma.recordsRequest.findMany({
    where: isStaff(user) ? {} : { requesterId: user.id },
    orderBy: [{ closedAt: { sort: "desc", nulls: "first" } }, { dueAt: "asc" }],
    select: {
      id: true,
      referenceNumber: true,
      subject: true,
      status: true,
      submittedAt: true,
      dueAt: true,
      closedAt: true,
      // Requester and assignee names are only selected for staff views.
      requester: isStaff(user) ? { select: { name: true } } : false,
      assignedClerk: isStaff(user) ? { select: { name: true } } : false,
    },
  });
}

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
