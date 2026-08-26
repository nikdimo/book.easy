/**
 * Which language a given piece of system mail goes out in.
 *
 * One rule, in one place, because getting it wrong is invisible: the email sends, it
 * just sends in a language the recipient did not ask for, and the only person who
 * would notice never reports it.
 *
 * The rule is that the recipient's *current saved account language* wins. Not the
 * language of whoever triggered the send, not the language the browser happened to
 * be in — the one they chose and can change. Host and guest mail about the same
 * booking is therefore rendered separately, once per recipient.
 *
 * The sign-in link is the single exception, and it lives in `request-locale.ts`: it
 * is sent while the recipient is still on the site, to an address that may not have
 * an account yet, so it follows the request instead.
 */

/** What `Booking` exposes about who the guest is and how they booked. */
export interface GuestLocaleSource {
  /** The guest's account language, as it stands right now. */
  guest: { locale: string | null };
  /** The language the booking request itself was made in. */
  guestLocale: string | null;
}

/**
 * The language a guest's booking mail goes out in.
 *
 * `User.locale` first, and `Booking.guestLocale` only when the account has none.
 *
 * `guestLocale` is a snapshot of the language the request was *made* in. That is the
 * right thing for the public confirmation page a signed-out guest lands on straight
 * after booking, and the wrong thing three weeks later: a guest who has since set
 * their account language is telling us what to write to them in, and that has to beat
 * what a cookie said at booking time. It stays as the fallback because a guest who
 * booked before ever saving a preference is still better served in the language they
 * booked in than in English.
 *
 * A saved language we do not support resolves to English rather than falling through
 * to `guestLocale` — an explicit choice is still a choice, and quietly overriding it
 * with a stale cookie value would be the same bug in the other direction.
 */
export function guestEmailLocale(booking: GuestLocaleSource): string | null {
  return booking.guest.locale ?? booking.guestLocale;
}
