import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { clientIpFrom } from "@/lib/client-ip";

export type AuditAction =
  | "auth.login_succeeded"
  | "auth.login_failed"
  | "auth.login_rate_limited"
  | "auth.logout"
  | "request.created"
  | "request.status_changed"
  | "request.assigned"
  | "document.uploaded"
  | "document.released"
  | "note.added";

type AuditEntry = {
  action: AuditAction;
  actorId?: string | null;
  entityType: string;
  entityId?: string | null;
  requestId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

async function clientIp(): Promise<string | null> {
  try {
    return clientIpFrom(await headers());
  } catch {
    return null; // called outside a request (e.g. a script)
  }
}

/**
 * Writes one audit row. Pass a transaction client so the audit entry commits
 * or rolls back together with the change it describes.
 */
export async function recordAudit(
  entry: AuditEntry,
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  await db.auditLog.create({
    data: {
      action: entry.action,
      actorId: entry.actorId ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      requestId: entry.requestId ?? null,
      metadata: entry.metadata,
      ipAddress: await clientIp(),
    },
  });
}
