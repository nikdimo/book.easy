/**
 * The email strings whose translation key is built at run time rather than written
 * as a literal, and the English each one falls back to.
 *
 * They live here, apart from the templates, for one reason: the catalog scanner in
 * `catalog.test.ts` finds `t.t("literal.key", "English")` call sites, and these have
 * no literal to find. Adding an enum value to a table below without adding its
 * translations would otherwise ship an email that silently prints English — or, for
 * an unrecognised value, a lower-cased database enum — to every non-English
 * recipient. `email-translation-completeness.test.ts` reads these tables directly,
 * so the omission fails the build instead.
 */

/** `SafetyCase.status` → the status line in a case email. */
export const CASE_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  AWAITING_INFORMATION: "Awaiting information",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};

/** `SafetyCase.claimKind` → the noun in "a booking-related {kind} request".
 * `PAYMENT` is the fallback for a claim with no kind recorded, so it is a real
 * entry here even though no enum value maps to it. */
export const CLAIM_KIND_LABELS: Record<string, string> = {
  EXPENSE: "expense",
  DAMAGE: "damage",
  REFUND: "refund",
  PAYMENT: "payment",
};

/** `SafetyCase.responseStatus` → the response line in a claim email. */
export const CLAIM_RESPONSE_LABELS: Record<string, string> = {
  AWAITING_ADMIN: "Awaiting admin",
  AWAITING_RECIPIENT: "Awaiting recipient",
  ACCEPTED: "Accepted",
  COUNTERED: "Countered",
  REJECTED: "Rejected",
  ESCALATED: "Escalated",
};

export function caseStatusKey(status: string): string {
  return `email.case.status.${status.toLowerCase()}`;
}

export function claimKindKey(kind: string): string {
  return `email.claim.kind.${kind.toLowerCase()}`;
}

export function claimResponseKey(status: string): string {
  return `email.claim.response.${status.toLowerCase()}`;
}

/**
 * The plural category of `count` in `locale`, as `Intl` reports it.
 *
 * Guest counts are whole numbers, and the categories a language uses for whole
 * numbers are not the `one`/`other` pair English gets by with: Polish never selects
 * `other` at all, and Russian, Ukrainian, Serbian and Romanian all select `few` for
 * two guests. Every category a language can reach here needs its own catalog entry.
 */
export function guestCountKey(locale: string, count: number): string {
  return `email.booking.guest_count.${new Intl.PluralRules(locale).select(count)}`;
}

/** The English "{n} guest" / "{n} guests" a category falls back to. */
export function guestCountSource(category: string): string {
  return category === "one" ? "{n} guest" : "{n} guests";
}

/** Every plural category `locale` can select for a whole number of guests. */
export function integerPluralCategories(locale: string): string[] {
  const rules = new Intl.PluralRules(locale);
  const categories = new Set<string>();
  // A listing's guest capacity is small, but the categories repeat on a cycle far
  // shorter than this, so a thousand is a cheap way to be sure none is missed.
  for (let count = 0; count <= 1000; count += 1) categories.add(rules.select(count));
  return [...categories];
}
