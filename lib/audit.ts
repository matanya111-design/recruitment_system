import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";

export async function writeAudit(params: {
  actorEmail: string;
  action: string;
  entityType: string;
  entityId?: string | number;
  before?: unknown;
  after?: unknown;
}) {
  try {
    const db = getDb();
    await db.insert(auditLogs).values({
      actorEmail: params.actorEmail,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId != null ? String(params.entityId) : null,
      beforeJson: params.before ?? null,
      afterJson: params.after ?? null,
    });
  } catch {
    // Audit failure must not break the main operation
  }
}
