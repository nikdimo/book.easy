import { getAuditLogs } from "@/lib/services/admin.service";
import { mobileJson, mobileOptions, requireMobileAdmin } from "@/lib/mobile-api";

/** Recent admin activity, newest first. Read-only by design — an audit log that can
 *  be edited from a phone is not an audit log. Admin-only. */
export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileAdmin(request);
  if ("response" in access) return access.response;

  const logs = await getAuditLogs();

  return mobileJson(request, {
    logs: logs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      createdAt: log.createdAt.toISOString(),
      user: { name: log.user.name, email: log.user.email },
      // Serialised here so the client never has to guess at the JSON shape, which
      // differs per action.
      details: log.metadata ? JSON.stringify(log.metadata) : null,
    })),
  });
}
