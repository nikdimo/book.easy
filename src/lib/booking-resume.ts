/**
 * The half of a booking selection that cannot ride on the URL.
 *
 * A guest who presses request to book while signed out is sent to `/login` with the
 * stay on the return URL, so the dates and the party come back on their own. The note
 * and the chosen payment method have no place there: the return URL is embedded in the
 * magic-link email and in every redirect log along the way, and a free-text note is the
 * one field of this form a guest may have put something personal in. They travel in the
 * guest's own browser instead, and are handed back once — the draft is cleared as it is
 * read, so a stale one cannot resurface on a later visit.
 */

export type BookingResumeDraft = {
  listingId: string;
  note: string;
  paymentMethod: string | null;
  /**
   * The whole stay the guest picked on a fixed-stay listing, when they picked one.
   *
   * It travels here rather than on the return URL for a reason the note does not share:
   * a fixed stay is not a date range, and putting its dates on the URL would let them
   * come back as an arbitrary selection on a listing that offers no such thing. An id is
   * meaningless anywhere but this listing, and is re-checked against the server's current
   * options before it is restored — so a stay that was booked while the guest read their
   * email comes back as nothing at all rather than as a stale choice.
   *
   * Optional on the way in, so a flexible caller writes exactly the draft it always
   * wrote. Always present on the way out: `parseBookingResumeDraft` fills it with null
   * for the drafts — every one written before this existed — that do not carry it.
   */
  fixedStayPeriodId?: string | null;
  savedAt: number;
};

export const BOOKING_RESUME_STORAGE_KEY = "bookeasy:booking-resume:v1";

/** Long enough for a magic link to arrive and be opened, short enough that a draft
 *  never outlives the sitting it was written in. */
export const BOOKING_RESUME_TTL_MS = 60 * 60 * 1000;

export function parseBookingResumeDraft(
  raw: string | null,
  now: number = Date.now(),
): BookingResumeDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<BookingResumeDraft>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.listingId !== "string" || !parsed.listingId) return null;
    if (typeof parsed.savedAt !== "number" || !Number.isFinite(parsed.savedAt)) {
      return null;
    }
    // A clock that moved backwards (a manually set date, a laptop resuming) would
    // otherwise leave a draft that is always "from the future" and never expires.
    const age = now - parsed.savedAt;
    if (age < 0 || age > BOOKING_RESUME_TTL_MS) return null;
    return {
      listingId: parsed.listingId,
      note: typeof parsed.note === "string" ? parsed.note : "",
      paymentMethod:
        typeof parsed.paymentMethod === "string" ? parsed.paymentMethod : null,
      // Absent in every draft written before fixed stays existed, and absent in every
      // flexible draft written since. Reading it as null keeps those parsing unchanged.
      fixedStayPeriodId:
        typeof parsed.fixedStayPeriodId === "string" && parsed.fixedStayPeriodId
          ? parsed.fixedStayPeriodId
          : null,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function writeBookingResumeDraft(draft: BookingResumeDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BOOKING_RESUME_STORAGE_KEY,
      JSON.stringify(draft),
    );
  } catch {
    // Signing in and booking both still work when browser storage is unavailable;
    // only the note and the payment choice have to be entered again.
  }
}

export function clearBookingResumeDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(BOOKING_RESUME_STORAGE_KEY);
  } catch {
    // Nothing to recover from: the draft expires on its own.
  }
}

/**
 * Reads the draft for this listing and clears it, whichever listing it belonged to.
 * A draft left behind by another listing is dropped rather than carried around: the
 * guest who abandoned it is the same guest now standing somewhere else.
 */
export function takeBookingResumeDraft(
  listingId: string,
  now: number = Date.now(),
): BookingResumeDraft | null {
  if (typeof window === "undefined") return null;
  let draft: BookingResumeDraft | null = null;
  try {
    draft = parseBookingResumeDraft(
      window.localStorage.getItem(BOOKING_RESUME_STORAGE_KEY),
      now,
    );
  } catch {
    return null;
  }
  clearBookingResumeDraft();
  return draft && draft.listingId === listingId ? draft : null;
}
