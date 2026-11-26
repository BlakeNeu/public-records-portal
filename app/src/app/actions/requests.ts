"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { dueDateFor } from "@/lib/deadlines";
import { Prisma } from "@/generated/prisma/client";

const MAX_REQUESTS_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

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

  // 3. Cap how many requests one account can file, so a script can't flood
  //    the clerks' queue. Counted in the database, so it holds across servers.
  const submittedAt = new Date();
  const filedToday = await prisma.recordsRequest.count({
    where: { requesterId: user.id, submittedAt: { gte: new Date(submittedAt.getTime() - DAY_MS) } },
  });
  if (filedToday >= MAX_REQUESTS_PER_DAY) {
    return {
      message: `You can file up to ${MAX_REQUESTS_PER_DAY} requests in 24 hours. Please try again later.`,
    };
  }

  // 4. Save the request and its audit entry together (both or neither).
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

  // 5. Send the citizen to their new request.
  redirect(`/requests/${requestId}`);
}
