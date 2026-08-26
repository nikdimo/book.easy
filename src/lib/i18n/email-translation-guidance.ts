/**
 * What a translator — human or model — has to know before touching an `email.*`
 * string, over and above the guidance that applies to the rest of the UI.
 *
 * The rest of the catalog is buttons, labels and empty states: a clumsy rendering is
 * ugly, and the user can see the screen it belongs to. A transactional email is
 * neither. It arrives alone, hours later, with no product around it to correct a
 * misreading, and it is the only place some of these facts are ever stated. A guest
 * who reads a decline as an acceptance travels to a house that is not expecting them.
 * A host who reads "we will refund the guest" believes a platform is holding money
 * that it has never touched.
 *
 * The single largest risk is the last one. Linger Homes runs on request-to-book and
 * takes no booking money at all: it never charges a guest, holds nothing, refunds
 * nothing, and pays no host out. Every language has ready-made booking-site phrasing
 * for a platform that *does* — "your refund is being processed", "the payment will be
 * captured" — and a translator reaching for the familiar register will reintroduce
 * exactly the claim the English was rewritten to remove.
 *
 * Shared by the generation scripts and by anyone reviewing an email string by hand.
 */
export const EMAIL_TRANSLATION_GUIDANCE = [
  "Keys beginning with `email.` are transactional email, not interface copy. Translate them as",
  "high-stakes written correspondence about money, travel plans, safety reports and disputes —",
  "the register of a booking confirmation or a formal notice, not of a button label.",
  "Keep them plain and unambiguous: no marketing tone, no idioms, no softening, no cheerfulness",
  "the English does not have.",

  "Booking status is the fact the whole message exists to convey. A request, an acceptance, a",
  "decline, an expiry and a cancellation must each stay clearly distinguishable in the target",
  "language, and a request must never read as a confirmed reservation.",

  "Payment wording must stay literally accurate. Linger Homes does not collect, hold, process or",
  "refund booking payments; hosts and guests arrange payment directly with each other. Never",
  "translate these sentences into a platform-payment idiom, and never introduce the notions of",
  "charging, capturing, holding, escrow, processing, payouts, or issuing a refund. Where the",
  "English says there is nothing for us to refund, the translation must say that and not soften it",
  "into a refund promise.",

  "Cancellation, safety-report and claim wording is quoted in disputes. Translate it exactly, keep",
  "any statement of what the recipient may do (accept, counter, reject) and any deadline intact,",
  "and add no reassurance, obligation or consequence that the English does not state.",

  "Never translate or alter: brand and product names (Linger Homes), people's names, booking",
  "references (LH-2026-XXXXXXXX), property names, URLs, email addresses, currency codes (EUR, MKD),",
  "or anything inside {curly braces}. Keep every placeholder spelled exactly as in the source.",

  "Dates and amounts are formatted by the application, not written here. Do not add currency",
  "symbols, convert amounts, or reorder a date that appears only as a placeholder.",

  "Keys under `email.booking.guest_count.` are CLDR plural categories for a whole number of guests.",
  "Write the form the language actually requires for that category — `few` and `many` are not",
  "stylistic variants of `other`.",
].join(" ");
