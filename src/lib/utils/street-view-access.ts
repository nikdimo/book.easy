/** How long before check-in the exact-location details (Street View, and later the
 *  host's arrival instructions) become visible to a guest. */
export const EXACT_LOCATION_UNLOCK_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The moment a confirmed booking's exact-location details become visible. */
export function exactLocationUnlocksAt(checkIn: Date) {
  return new Date(checkIn.getTime() - EXACT_LOCATION_UNLOCK_DAYS * DAY_MS);
}

/** Whether a guest may see exactly where the property is.
 *
 *  Street View shows the building itself, so it is deliberately not public: a host
 *  advertises an area, and the precise front door is only revealed once a stay is
 *  actually happening. Two gates, both required — the host has confirmed the booking,
 *  and arrival is close enough that the guest needs to find the place. COMPLETED and
 *  IN-progress stays stay unlocked because the guest has already been there; every
 *  cancelled/rejected/expired status locks back down. */
export function canSeeExactLocation(
  booking: { status: string; checkIn: Date },
  now: Date = new Date()
) {
  if (booking.status === "COMPLETED") return true;
  if (booking.status !== "CONFIRMED") return false;
  return now.getTime() >= exactLocationUnlocksAt(booking.checkIn).getTime();
}
