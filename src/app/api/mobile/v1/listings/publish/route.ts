import { submitNewListing } from "@/lib/actions/listing.actions";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";
import { normalizePropertyType } from "@/lib/types/property-type";
import { HOUSE_RULES_DRAFT_FIELDS } from "@/lib/host/v2/listing-house-rules-draft";

/** Publishes a draft as a real listing.
 *
 *  Delegates to submitNewListing — the same action the web wizard posts to — so
 *  every rule lives in one place: the listing schema, the 5–50% discount bound, the
 *  1–365 night promotion stay, free cleaning needing a cleaning fee, the three-photo
 *  minimum, cover-image selection, amenity wiring, and deleting the draft once the
 *  listing exists. This route only translates JSON into the FormData that action
 *  expects; it makes no decisions of its own.
 *
 *  The action re-checks the session and host role itself. requireMobileHost runs
 *  first for the origin check and so an unauthorised caller gets a mobile-shaped
 *  error rather than the action's plain string. */

const TEXT_FIELDS = [
  "title",
  "description",
  "propertyType",
  "spaceType",
  "address",
  "city",
  "area",
  "postalCode",
  "country",
  "latitude",
  "longitude",
  "locationSource",
  "locationConfirmed",
  "geocodingProvider",
  "geocodingPlaceId",
  "geocodingConfidence",
  "streetViewHeading",
  "streetViewPitch",
  "streetViewPanoId",
  "bedrooms",
  "bathrooms",
  "beds",
  "currency",
  "baseNightlyRate",
  "cleaningFee",
  "minNights",
  "promotionType",
  "promotionPercent",
  "promotionMinimumNights",
  // Every house-rules field, taken from the list the draft module owns rather than
  // spelled out again. This list previously omitted checkInTime and checkOutTime
  // altogether, so a mobile publish silently dropped the arrival times the host had
  // already stored on the draft; sourcing the names from one place is what stops the
  // next rule from being lost the same way.
  ...HOUSE_RULES_DRAFT_FIELDS,
] as const;

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function POST(request: Request) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object") {
    return mobileJson(request, { error: "Invalid listing" }, { status: 400 });
  }

  const formData = new FormData();
  for (const field of TEXT_FIELDS) {
    const value =
      field === "propertyType"
        ? normalizePropertyType(
            typeof body[field] === "string" ? body[field] : undefined
          )
        : body[field];
    if (value !== undefined && value !== null) formData.set(field, String(value));
  }

  // Repeated entries, matching the web form. Order is preserved, and the action
  // derives the cover from the first IMAGE.
  if (Array.isArray(body.amenityIds)) {
    for (const id of body.amenityIds) formData.append("amenityIds", String(id));
  }
  if (Array.isArray(body.mediaItems)) {
    for (const item of body.mediaItems) formData.append("mediaItems", JSON.stringify(item));
  }

  // Keep the mobile client on the same fail-closed publication path as the web
  // wizard. submitNewListing parses and validates this value; missing/malformed
  // availability is never inferred as "available now".
  if (body.prePublishPlan !== undefined) {
    formData.set("prePublishPlan", JSON.stringify(body.prePublishPlan));
  }

  const draftId = typeof body.draftId === "string" ? body.draftId : null;
  const result = await submitNewListing(formData, draftId);

  if ("error" in result) {
    return mobileJson(request, { error: result.error }, { status: 400 });
  }
  return mobileJson(request, { listingId: result.listingId });
}
