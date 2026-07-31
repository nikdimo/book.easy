import { mobileJson, mobileOptions, requireMobileAdmin } from "@/lib/mobile-api";
import { getAllListingsForAdmin } from "@/lib/services/admin.service";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileAdmin(request);
  if ("response" in access) return access.response;

  const listings = await getAllListingsForAdmin();

  const formatted = listings.map((l) => ({
    id: l.id,
    slug: l.slug,
    title: l.title,
    status: l.status,
    needsReview: l.needsReview,
    city: l.property?.city ?? "Unknown",
    hostName: l.host?.name ?? "Host",
    hostEmail: l.host?.email ?? "",
    bookingCount: l._count?.bookings ?? 0,
    nightlyRate: l.pricingRule?.baseNightlyRate ? Number(l.pricingRule.baseNightlyRate) : null,
    currency: l.pricingRule?.currency ?? "EUR",
    updatedAt: l.updatedAt.toISOString(),
  }));

  return mobileJson(request, { listings: formatted });
}
