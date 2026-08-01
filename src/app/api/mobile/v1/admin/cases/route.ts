import { listAdminSafetyCases } from "@/lib/services/safety-case.service";
import { mobileJson, mobileOptions, requireMobileAdmin } from "@/lib/mobile-api";

/** Safety cases, reports and claims queue. Reads through listAdminSafetyCases, the
 *  same service the web admin page uses, so ordering (priority, then newest) and the
 *  included relations stay identical. Admin-only. */
export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileAdmin(request);
  if ("response" in access) return access.response;

  const cases = await listAdminSafetyCases();

  return mobileJson(request, {
    cases: cases.map((entry) => ({
      id: entry.id,
      reference: entry.reference,
      type: entry.type,
      category: entry.category,
      status: entry.status,
      priority: entry.priority,
      subject: entry.subject,
      createdAt: entry.createdAt.toISOString(),
      reporter: entry.reporter
        ? { id: entry.reporter.id, name: entry.reporter.name }
        : null,
      reportedUser: entry.reportedUser
        ? { id: entry.reportedUser.id, name: entry.reportedUser.name }
        : null,
      listing: entry.listing
        ? { id: entry.listing.id, title: entry.listing.title }
        : null,
      assignedAdmin: entry.assignedAdmin?.name ?? null,
      evidenceCount: entry._count.evidence,
      updateCount: entry._count.updates,
    })),
  });
}
