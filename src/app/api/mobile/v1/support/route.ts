import {
  addUserSafetyCaseUpdate,
  getUserSafetyCase,
  listUserSafetyCases,
} from "@/lib/services/safety-case.service";
import { mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";

/** The signed-in user's own support cases, reports and claims.
 *
 *  Everything goes through safety-case.service, which scopes each query to cases the
 *  user reported or was reported in, and — importantly — filters the update thread to
 *  `isInternal: false`. Admin-only notes on a case must never reach the reporter, and
 *  passing the service through rather than querying here is what keeps that true.
 *
 *  Guarded by requireMobileUser: raising a report is not a hosting action. */
export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access.response;

  const url = new URL(request.url);
  const caseId = url.searchParams.get("caseId");

  if (caseId) {
    const detail = await getUserSafetyCase(caseId, access.user.id);
    if (!detail) {
      return mobileJson(request, { error: "Case not found" }, { status: 404 });
    }
    return mobileJson(request, {
      case: {
        id: detail.id,
        reference: detail.reference,
        type: detail.type,
        category: detail.category,
        status: detail.status,
        priority: detail.priority,
        subject: detail.subject,
        description: detail.description,
        createdAt: detail.createdAt.toISOString(),
        listing: detail.listing
          ? { id: detail.listing.id, title: detail.listing.title }
          : null,
        evidence: detail.evidence.map((item) => ({
          id: item.id,
          url: item.url,
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
        })),
        updates: detail.updates.map((update) => ({
          id: update.id,
          body: update.body,
          createdAt: update.createdAt.toISOString(),
          author: update.author
            ? { name: update.author.name, role: update.author.role }
            : null,
        })),
      },
    });
  }

  const cases = await listUserSafetyCases(access.user.id);
  return mobileJson(request, {
    cases: cases.map((entry) => ({
      id: entry.id,
      reference: entry.reference,
      type: entry.type,
      category: entry.category,
      status: entry.status,
      subject: entry.subject,
      createdAt: entry.createdAt.toISOString(),
      listing: entry.listing
        ? { id: entry.listing.id, title: entry.listing.title }
        : null,
      evidenceCount: entry._count.evidence,
      updateCount: entry._count.updates,
    })),
  });
}

export async function POST(request: Request) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access.response;

  const body = (await request.json().catch(() => null)) as {
    caseId?: string;
    body?: string;
  } | null;
  if (!body?.caseId || !body.body) {
    return mobileJson(request, { error: "Case and message are required" }, { status: 400 });
  }

  try {
    await addUserSafetyCaseUpdate({
      caseId: body.caseId,
      userId: access.user.id,
      body: body.body,
    });
    return mobileJson(request, { success: true });
  } catch (error) {
    // The service throws for a case that is closed or not the user's — both are
    // the caller's problem, not a server fault.
    return mobileJson(
      request,
      { error: error instanceof Error ? error.message : "Could not add the message" },
      { status: 400 }
    );
  }
}
