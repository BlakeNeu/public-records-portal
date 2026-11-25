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
