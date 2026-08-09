/** Fields the native existing-listing editor is allowed to publish.
 *
 * Standard pricing is intentionally absent. Older mobile clients can still send
 * those keys, but the API must ignore them so a stale detail form cannot revert a
 * newer change made in the calendar Pricing workspace. */
const MOBILE_LISTING_EDITOR_TEXT_FIELDS = [
  "title",
  "description",
  "propertyType",
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
  "maxGuests",
  "bedrooms",
  "bathrooms",
  "beds",
  "currency",
] as const;

export function appendMobileListingEditorTextFields(
  formData: FormData,
  body: Record<string, unknown>
): void {
  for (const field of MOBILE_LISTING_EDITOR_TEXT_FIELDS) {
    const value = body[field];
    if (value !== undefined && value !== null) formData.set(field, String(value));
  }
}
