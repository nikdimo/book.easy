import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

interface AuditEntry {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export async function createAuditLog(entry: AuditEntry) {
  return db.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
