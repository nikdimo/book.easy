/**
 * The rules behind the Arrival guide section.
 *
 * One module for every layer that touches an arrival guide — the card list, the nine
 * detail editors, the server action that writes them, the service that decides what a
 * guest may read, and the tests — because they are the same decisions and a second copy
 * of these bounds would drift from this one. Kept free of i18n, JSX and Prisma so it can
 * run in all five places.
 *
 * Two things here are load-bearing and are not obvious from the field names:
 *
 * 1. **Null means unanswered.** Not "no", not "none". A listing that predates this
 *    section has never been asked whether it has a lockbox, and the guest page prints
 *    nothing for it rather than claiming the host offers no check-in method — the same
 *    convention every house-rules policy already uses.
 *
 * 2. **Three fields are secrets and one is not.** `checkInMethodInstructions` and
 *    `wifiPassword` open a real door, and `wifiNetwork` is useless without the password
 *    but embarrassing beside it. `ARRIVAL_FIELD_VISIBILITY` is the single table that says
 *    who may read each field and when; nothing downstream is allowed to decide that for
 *    itself, because a rule restated at three call sites is a rule that will eventually
 *    be wrong at one of them.
 *
 * Stay times are deliberately not in here. `checkInTime`, `checkInEndTime` and
 * `checkOutTime` belong to House rules (`listing-house-rules.ts`), which stays their only
 * writer even though the Arrival guide's first card shows and edits them — see
 * `updateListingArrivalStayTimes`, which delegates rather than duplicating.
 */

/* ------------------------------------------------------------------------------------
 * The cards, in the order the host reads down them
 * ---------------------------------------------------------------------------------- */

/**
 * One card in the left column, and the route segment its editor lives on.
 *
 * The order is the point, and it is Airbnb's: when to arrive, how to find the place, how
 * to get in, what to do once inside, what to do on the way out, then the two questions
 * about the host rather than the property. A host who has used Airbnb finds each one
 * where they left it.
 *
 * `slug` is a URL segment, so the detail pane is a real page — linkable, refreshable and
 * reachable with the back button, which is what Airbnb's own `/arrival/<slug>` URLs are.
 */
export interface ArrivalGuideTopic {
  slug: string;
  /** UI catalog key for the card title. */
  key: string;
  /** English source text, and the fallback when nothing is translated. */
  source: string;
  /**
   * Whether this card owns fields on `ListingArrivalGuide`. False for the two that
   * borrow: House rules edits Listing columns through its own writer, and Guidebooks has
   * no storage at all yet.
   */
  stored: boolean;
}

export const ARRIVAL_GUIDE_TOPICS: readonly ArrivalGuideTopic[] = [
  { slug: "check-in-checkout", key: "host.editor.arrival.topic.check_in_checkout", source: "Check-in & checkout", stored: false },
  { slug: "directions", key: "host.editor.arrival.topic.directions", source: "Directions", stored: true },
  { slug: "check-in-method", key: "host.editor.arrival.topic.check_in_method", source: "Check-in method", stored: true },
  { slug: "wifi-details", key: "host.editor.arrival.topic.wifi", source: "Wifi details", stored: true },
  { slug: "house-manual", key: "host.editor.arrival.topic.house_manual", source: "House manual", stored: true },
  { slug: "house-rules", key: "host.editor.arrival.topic.house_rules", source: "House rules", stored: false },
  { slug: "checkout-instructions", key: "host.editor.arrival.topic.checkout_instructions", source: "Checkout instructions", stored: true },
  { slug: "guidebooks", key: "host.editor.arrival.topic.guidebooks", source: "Guidebooks", stored: false },
  { slug: "interaction-preferences", key: "host.editor.arrival.topic.interaction", source: "Interaction preferences", stored: true },
];

/** The card the section opens on when no topic is in the URL, matching Airbnb. */
export const DEFAULT_ARRIVAL_TOPIC = ARRIVAL_GUIDE_TOPICS[0].slug;

export function findArrivalGuideTopic(slug: string): ArrivalGuideTopic | undefined {
  return ARRIVAL_GUIDE_TOPICS.find((topic) => topic.slug === slug);
}

/* ------------------------------------------------------------------------------------
 * Check-in method
 * ---------------------------------------------------------------------------------- */

export const CHECK_IN_METHODS = [
  "SMART_LOCK",
  "KEYPAD",
  "LOCKBOX",
  "BUILDING_STAFF",
  "IN_PERSON",
  "OTHER",
] as const;
export type CheckInMethod = (typeof CHECK_IN_METHODS)[number];

/**
 * Whether a method needs a secret to be usable.
 *
 * A keypad without its code is not a check-in method, it is a locked door — so these
 * three prompt for instructions and say plainly that the text is a credential. The other
 * three are arrangements rather than secrets: "someone will let you in" is complete on
 * its own, and the instructions field stays available but optional.
 */
export const CHECK_IN_METHODS_NEEDING_CODE: readonly CheckInMethod[] = [
  "SMART_LOCK",
  "KEYPAD",
  "LOCKBOX",
];

export function checkInMethodNeedsCode(method: CheckInMethod | null): boolean {
  return method !== null && CHECK_IN_METHODS_NEEDING_CODE.includes(method);
}

/* ------------------------------------------------------------------------------------
 * Checkout instructions
 * ---------------------------------------------------------------------------------- */

export const CHECKOUT_INSTRUCTION_KINDS = [
  "GATHER_TOWELS",
  "THROW_TRASH",
  "TURN_THINGS_OFF",
  "LOCK_UP",
  "RETURN_KEYS",
  "ADDITIONAL_REQUESTS",
] as const;
export type CheckoutInstructionKind = (typeof CHECKOUT_INSTRUCTION_KINDS)[number];

/**
 * One thing the host asks a guest to do before leaving.
 *
 * `note` is the host's own wording, or empty for the standard sentence that goes with the
 * kind. Two rows of the same kind are not allowed — "throw the trash away" twice is a
 * mistake in every case, and the picker hides a kind that is already on the list rather
 * than letting one be added and then puzzled over.
 */
export interface CheckoutInstruction {
  kind: CheckoutInstructionKind;
  note: string;
}

/** ADDITIONAL_REQUESTS is the free-text row, so it is the one kind whose note is the
 *  whole point rather than an override. An empty one is dropped on save. */
export const CHECKOUT_INSTRUCTION_FREE_TEXT: CheckoutInstructionKind = "ADDITIONAL_REQUESTS";

/* ------------------------------------------------------------------------------------
 * Interaction preference
 * ---------------------------------------------------------------------------------- */

export const INTERACTION_PREFERENCES = [
  "APP_ONLY",
  "SAY_HELLO",
  "SOCIABLE",
  "NO_PREFERENCE",
] as const;
export type InteractionPreference = (typeof INTERACTION_PREFERENCES)[number];

/* ------------------------------------------------------------------------------------
 * Lengths
 * ---------------------------------------------------------------------------------- */

/** Long enough for the three or four paragraphs real directions run to — the turn off the
 *  main road, the bell, where to park — and short enough that it stays directions rather
 *  than becoming a second description. */
export const DIRECTIONS_MAX = 2000;
/** The manual is the longest thing here on purpose: it is where the boiler, the TV and the
 *  bins get explained, and hosts who write one write a lot. */
export const HOUSE_MANUAL_MAX = 5000;
/** A door code plus the sentence around it. Anything longer is a manual, and there is a
 *  field for that. */
export const CHECK_IN_INSTRUCTIONS_MAX = 1000;
/** An SSID is 32 bytes by the 802.11 standard; the extra room is for hosts who paste the
 *  network name with the router's label around it. */
export const WIFI_NETWORK_MAX = 64;
export const WIFI_PASSWORD_MAX = 128;
/** One sentence per checkout task. The list is read at the door, on a phone, by someone
 *  who is already late. */
export const CHECKOUT_NOTE_MAX = 300;

/* ------------------------------------------------------------------------------------
 * Who may read what, and when
 * ---------------------------------------------------------------------------------- */

/**
 * How exposed a field is.
 *
 * `PUBLIC` — anybody, including someone who has not booked. Airbnb's own rule for
 *   checkout instructions is that a guest can read them *before* they book, and it is the
 *   right one: "strip the beds and start the dishwasher" is a term of the stay, and
 *   finding it out afterwards is how a fair request becomes a bad review.
 * `BOOKED` — released the moment a booking is confirmed. The guest is coming; they may
 *   plan the journey.
 * `PRE_ARRIVAL` — released `ARRIVAL_CREDENTIAL_RELEASE_HOURS` before check-in. Everything
 *   here is a credential or reads like one.
 */
export type ArrivalFieldVisibility = "PUBLIC" | "BOOKED" | "PRE_ARRIVAL";

/**
 * How long before check-in the credentials appear.
 *
 * 48 hours, which is the outer edge of the "24 – 48 hours before check-in" that Airbnb
 * tells hosts. Erring long is the kind choice: a guest flying in needs the door code
 * before they take off, and a code that arrives while they are in the air is a code that
 * did not arrive. It buys the host something real even so — a code released two days out
 * is not a code sitting in a stranger's inbox for eight months, which is what putting it
 * in the listing description amounts to.
 */
export const ARRIVAL_CREDENTIAL_RELEASE_HOURS = 48;

/**
 * The one table that says who may read each field.
 *
 * Every reader consults this rather than deciding for itself. That is the whole safety
 * story for this feature: a new surface that wants to show arrival details asks here,
 * gets an answer, and cannot accidentally invent a more generous rule than the guest
 * page already applies.
 */
export const ARRIVAL_FIELD_VISIBILITY = {
  directions: "BOOKED",
  checkInMethod: "PUBLIC",
  checkInMethodInstructions: "PRE_ARRIVAL",
  wifiNetwork: "PRE_ARRIVAL",
  wifiPassword: "PRE_ARRIVAL",
  houseManual: "PRE_ARRIVAL",
  checkoutInstructions: "PUBLIC",
  interactionPreference: "PUBLIC",
} as const satisfies Record<string, ArrivalFieldVisibility>;

export type ArrivalGuideField = keyof typeof ARRIVAL_FIELD_VISIBILITY;

/** The fields that open a door. Named separately from the visibility table because
 *  "released later" and "is a credential" are different claims, and the copy that warns a
 *  host not to paste a code into the wrong box needs the second one. */
export const ARRIVAL_SECRET_FIELDS: readonly ArrivalGuideField[] = [
  "checkInMethodInstructions",
  "wifiPassword",
];

/** When a `PRE_ARRIVAL` field becomes readable for a stay starting at `checkIn`. */
export function arrivalCredentialsUnlockAt(checkIn: Date): Date {
  return new Date(checkIn.getTime() - ARRIVAL_CREDENTIAL_RELEASE_HOURS * 60 * 60 * 1000);
}

/**
 * Whether this booking may see this field yet.
 *
 * A cancelled or declined booking never sees anything gated: the stay is not happening,
 * and a door code that stays readable after a cancellation is a door code the host has to
 * change. `now` is a parameter so the rule is testable and so a server render and the
 * assertion about it cannot disagree by a few milliseconds.
 */
export function canSeeArrivalField(
  field: ArrivalGuideField,
  booking: { status: string; checkIn: Date } | null,
  now: Date = new Date(),
): boolean {
  const visibility = ARRIVAL_FIELD_VISIBILITY[field];
  if (visibility === "PUBLIC") return true;
  if (!booking || booking.status !== "CONFIRMED") return false;
  if (visibility === "BOOKED") return true;
  return now.getTime() >= arrivalCredentialsUnlockAt(booking.checkIn).getTime();
}

/* ------------------------------------------------------------------------------------
 * The editable shape
 * ---------------------------------------------------------------------------------- */

/**
 * Everything the nine cards write, in the shape the client holds and the action accepts.
 *
 * Strings rather than `string | null` for the text fields: a textarea's empty state is
 * `""`, and letting the client choose between `""` and `null` for "the host cleared it"
 * would put two spellings of one fact on the wire. `normalizeListingArrivalGuide` is what
 * turns an empty string into the SQL NULL that means unanswered.
 */
export interface ListingArrivalGuideInput {
  directions: string;
  checkInMethod: CheckInMethod | null;
  checkInMethodInstructions: string;
  wifiNetwork: string;
  wifiPassword: string;
  houseManual: string;
  checkoutInstructions: CheckoutInstruction[];
  interactionPreference: InteractionPreference | null;
}

export function emptyListingArrivalGuide(): ListingArrivalGuideInput {
  return {
    directions: "",
    checkInMethod: null,
    checkInMethodInstructions: "",
    wifiNetwork: "",
    wifiPassword: "",
    houseManual: "",
    checkoutInstructions: [],
    interactionPreference: null,
  };
}

/* ------------------------------------------------------------------------------------
 * Normalising
 * ---------------------------------------------------------------------------------- */

function normalizeText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Windows line endings collapse to `\n` so a character count means the same thing to
  // the host's textarea, this limit and the database.
  return value.replace(/\r\n/g, "\n").trim().slice(0, max);
}

/** A single line: an SSID and a password are one token, and a newline pasted in from a
 *  router label is noise that later breaks the guest's copy button. */
function normalizeSingleLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeCheckInMethod(value: unknown): CheckInMethod | null {
  return CHECK_IN_METHODS.includes(value as CheckInMethod) ? (value as CheckInMethod) : null;
}

export function normalizeInteractionPreference(value: unknown): InteractionPreference | null {
  return INTERACTION_PREFERENCES.includes(value as InteractionPreference)
    ? (value as InteractionPreference)
    : null;
}

/**
 * The checkout list, made safe to store and safe to read back.
 *
 * This one is defensive in a way the rest are not, because it is the only field that
 * round-trips through a JSON column: whatever shape was written is exactly the shape that
 * comes back, including a shape written by an older build. So it is validated on the way
 * out as well as in, drops anything unrecognised rather than throwing, and de-duplicates
 * by kind so the list can never show the same instruction twice.
 */
export function normalizeCheckoutInstructions(value: unknown): CheckoutInstruction[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<CheckoutInstructionKind>();
  const result: CheckoutInstruction[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const kind = (entry as { kind?: unknown }).kind;
    if (!CHECKOUT_INSTRUCTION_KINDS.includes(kind as CheckoutInstructionKind)) continue;
    const typed = kind as CheckoutInstructionKind;
    if (seen.has(typed)) continue;
    const note = normalizeText((entry as { note?: unknown }).note, CHECKOUT_NOTE_MAX);
    // The free-text row is nothing but its note. Keeping an empty one would print a
    // heading with no request under it.
    if (typed === CHECKOUT_INSTRUCTION_FREE_TEXT && note === "") continue;
    seen.add(typed);
    result.push({ kind: typed, note });
  }
  // Stored in the catalog's order rather than the order they were added, so the list a
  // guest reads at the door is the same every time and matches the picker they were
  // chosen from.
  return result.sort(
    (a, b) =>
      CHECKOUT_INSTRUCTION_KINDS.indexOf(a.kind) - CHECKOUT_INSTRUCTION_KINDS.indexOf(b.kind),
  );
}

/**
 * A guide safe to write.
 *
 * Instructions are dropped when no method is chosen. Otherwise clearing the method would
 * leave a door code stored against nothing — invisible in the editor, still in the
 * database, and still released to the next guest 48 hours out.
 */
export function normalizeListingArrivalGuide(
  input: ListingArrivalGuideInput,
): ListingArrivalGuideInput {
  const checkInMethod = normalizeCheckInMethod(input.checkInMethod);
  return {
    directions: normalizeText(input.directions, DIRECTIONS_MAX),
    checkInMethod,
    checkInMethodInstructions: checkInMethod
      ? normalizeText(input.checkInMethodInstructions, CHECK_IN_INSTRUCTIONS_MAX)
      : "",
    wifiNetwork: normalizeSingleLine(input.wifiNetwork, WIFI_NETWORK_MAX),
    // Not `normalizeSingleLine`: a password's leading and trailing space matter as little
    // as its internal ones matter a lot, so only the ends are trimmed and nothing inside
    // is collapsed.
    wifiPassword:
      typeof input.wifiPassword === "string"
        ? input.wifiPassword.trim().slice(0, WIFI_PASSWORD_MAX)
        : "",
    houseManual: normalizeText(input.houseManual, HOUSE_MANUAL_MAX),
    checkoutInstructions: normalizeCheckoutInstructions(input.checkoutInstructions),
    interactionPreference: normalizeInteractionPreference(input.interactionPreference),
  };
}

/* ------------------------------------------------------------------------------------
 * Validating
 * ---------------------------------------------------------------------------------- */

export type ArrivalGuideIssue = "TOO_LONG" | "NOT_A_CHOICE" | "CODE_WITHOUT_METHOD";

export type ListingArrivalGuideIssues = Partial<
  Record<keyof ListingArrivalGuideInput, ArrivalGuideIssue>
>;

/**
 * What is wrong with a payload, as opposed to what normalising would quietly fix.
 *
 * The action refuses rather than corrects, for the same reason House rules does: a value
 * out of range can only come from a bypassed or stale client, and silently trimming it
 * would leave the host looking at a listing that says something they never wrote. The
 * editor calls this too, so a host who pastes 6000 characters of house manual is told
 * before anything is sent.
 */
export function listingArrivalGuidePayloadIssues(
  input: ListingArrivalGuideInput,
): ListingArrivalGuideIssues {
  const issues: ListingArrivalGuideIssues = {};

  if (typeof input.directions === "string" && input.directions.trim().length > DIRECTIONS_MAX)
    issues.directions = "TOO_LONG";
  if (typeof input.houseManual === "string" && input.houseManual.trim().length > HOUSE_MANUAL_MAX)
    issues.houseManual = "TOO_LONG";
  if (
    typeof input.checkInMethodInstructions === "string" &&
    input.checkInMethodInstructions.trim().length > CHECK_IN_INSTRUCTIONS_MAX
  )
    issues.checkInMethodInstructions = "TOO_LONG";
  if (typeof input.wifiNetwork === "string" && input.wifiNetwork.trim().length > WIFI_NETWORK_MAX)
    issues.wifiNetwork = "TOO_LONG";
  if (typeof input.wifiPassword === "string" && input.wifiPassword.trim().length > WIFI_PASSWORD_MAX)
    issues.wifiPassword = "TOO_LONG";

  if (input.checkInMethod !== null && normalizeCheckInMethod(input.checkInMethod) === null)
    issues.checkInMethod = "NOT_A_CHOICE";
  if (
    input.interactionPreference !== null &&
    normalizeInteractionPreference(input.interactionPreference) === null
  )
    issues.interactionPreference = "NOT_A_CHOICE";

  // A code with nowhere to belong is refused rather than dropped. Normalising drops it,
  // which is right for a stored row that has drifted; a *payload* that carries one is a
  // client bug, and answering "saved" to it would tell the host their door code is on the
  // listing when it is not.
  if (input.checkInMethod === null && normalizeText(input.checkInMethodInstructions, CHECK_IN_INSTRUCTIONS_MAX) !== "")
    issues.checkInMethodInstructions = "CODE_WITHOUT_METHOD";

  return issues;
}

/* ------------------------------------------------------------------------------------
 * Comparing
 * ---------------------------------------------------------------------------------- */

export function sameCheckoutInstructions(
  a: readonly CheckoutInstruction[],
  b: readonly CheckoutInstruction[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => entry.kind === b[index].kind && entry.note === b[index].note);
}

/** Whether a save would change anything, so an autosave that fires on a blur nobody typed
 *  into does not stamp a review timestamp or put a live listing back in the queue. */
export function sameListingArrivalGuide(
  a: ListingArrivalGuideInput,
  b: ListingArrivalGuideInput,
): boolean {
  return (
    a.directions === b.directions &&
    a.checkInMethod === b.checkInMethod &&
    a.checkInMethodInstructions === b.checkInMethodInstructions &&
    a.wifiNetwork === b.wifiNetwork &&
    a.wifiPassword === b.wifiPassword &&
    a.houseManual === b.houseManual &&
    a.interactionPreference === b.interactionPreference &&
    sameCheckoutInstructions(a.checkoutInstructions, b.checkoutInstructions)
  );
}

/* ------------------------------------------------------------------------------------
 * Card summaries
 * ---------------------------------------------------------------------------------- */

/**
 * Whether a card has anything to show under its title.
 *
 * The card list says "Add details" under every unanswered card, which is Airbnb's copy and
 * also the honest one — it is an invitation rather than a warning, because none of this is
 * required to publish. This decides which cards get it.
 */
export function arrivalTopicAnswered(
  slug: string,
  guide: ListingArrivalGuideInput,
): boolean {
  switch (slug) {
    case "directions":
      return guide.directions !== "";
    case "check-in-method":
      return guide.checkInMethod !== null;
    case "wifi-details":
      return guide.wifiNetwork !== "" || guide.wifiPassword !== "";
    case "house-manual":
      return guide.houseManual !== "";
    case "checkout-instructions":
      return guide.checkoutInstructions.length > 0;
    case "interaction-preferences":
      return guide.interactionPreference !== null;
    default:
      // The three cards that render their own summary from elsewhere: the stay times, the
      // house rules and the guidebooks that do not exist yet.
      return true;
  }
}

/* ------------------------------------------------------------------------------------
 * Row mapping
 * ---------------------------------------------------------------------------------- */

/** The stored row, in the shape Prisma returns it. Declared rather than imported so this
 *  module stays free of `@prisma/client` and can run in the browser bundle. */
export interface ListingArrivalGuideRow {
  directions: string | null;
  checkInMethod: string | null;
  checkInMethodInstructions: string | null;
  wifiNetwork: string | null;
  wifiPassword: string | null;
  houseManual: string | null;
  checkoutInstructions: unknown;
  interactionPreference: string | null;
}

export function arrivalGuideFromRow(
  row: ListingArrivalGuideRow | null | undefined,
): ListingArrivalGuideInput {
  if (!row) return emptyListingArrivalGuide();
  return {
    directions: row.directions ?? "",
    checkInMethod: normalizeCheckInMethod(row.checkInMethod),
    checkInMethodInstructions: row.checkInMethodInstructions ?? "",
    wifiNetwork: row.wifiNetwork ?? "",
    wifiPassword: row.wifiPassword ?? "",
    houseManual: row.houseManual ?? "",
    checkoutInstructions: normalizeCheckoutInstructions(row.checkoutInstructions),
    interactionPreference: normalizeInteractionPreference(row.interactionPreference),
  };
}

/** Empty string becomes SQL NULL, so "the host cleared this" and "the host never answered"
 *  are one state in the database rather than two that every reader would have to handle. */
export function arrivalGuideRowData(guide: ListingArrivalGuideInput) {
  return {
    directions: guide.directions || null,
    checkInMethod: guide.checkInMethod,
    checkInMethodInstructions: guide.checkInMethodInstructions || null,
    wifiNetwork: guide.wifiNetwork || null,
    wifiPassword: guide.wifiPassword || null,
    houseManual: guide.houseManual || null,
    checkoutInstructions: guide.checkoutInstructions,
    interactionPreference: guide.interactionPreference,
  };
}

export interface ListingArrivalGuideSaveResult {
  guide?: ListingArrivalGuideInput;
  reviewedAt?: string;
  error?: string;
  issues?: ListingArrivalGuideIssues;
}
