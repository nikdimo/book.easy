/**
 * The rules behind the House rules section.
 *
 * One module for both screens that edit house rules — the create flow's step and the
 * post-publish editor — because they are the same decisions and any second copy of
 * these bounds would drift from this one. It covers the three fields that were always
 * stored (arrival time, departure time, guest limit) and the five structured policies
 * added alongside them: pets, smoking, events, quiet hours and the host's own written
 * rules. See `docs/product/house-rules-data-contract.md` for what each one means to a
 * guest.
 *
 * Every policy is nullable, and null means *unanswered*. That is not the same as "not
 * allowed", and the difference is load-bearing: listings that predate these columns
 * have never been asked, so the public page prints nothing for them rather than
 * inventing a refusal their host never chose. Only the create flow requires answers —
 * see `requireAnswers` on `listingHouseRulesIssues` — because a host publishing today
 * is being asked, and an existing listing's editor is not a place to hold their page
 * hostage over a question that did not exist when they published.
 *
 * Kept free of i18n, JSX and Prisma so the same rules can run in four places: the
 * client, to disable a control and explain why before anything is sent; the server
 * action, to reject what a bypassed or stale client let through; publishing, to turn a
 * draft's strings into columns; and the tests, directly.
 */

/** The half hours the picker offers. Hosts outside the usual afternoon/morning window
 *  are common enough (early ferries, late flights) that trimming the list would just be
 *  a guess about which of them matter — the same 48 slots the classic editor shows. */
export const STAY_TIME_OPTIONS: readonly string[] = Array.from(
  { length: 48 },
  (_, index) => {
    const hour = String(Math.floor(index / 2)).padStart(2, "0");
    return `${hour}:${index % 2 === 0 ? "00" : "30"}`;
  },
);

/** What an empty stay time means: the host has not committed to a time, and the public
 *  listing shows no arrival line at all rather than inventing one. Stored as SQL NULL. */
export const FLEXIBLE_STAY_TIME = "";

/**
 * Any wall-clock minute on a 24-hour clock.
 *
 * Deliberately wider than the picker. Listings imported from Airbnb can arrive holding
 * "14:15", and a host who opens this tab to change their guest count must not have that
 * silently rewritten to "flexible" — which is exactly what the classic editor's
 * half-hour-only normalisation does to it. The picker adds any such stored value as its
 * own option, and this accepts it back unchanged.
 */
const STAY_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The ceiling the classic listing form has always enforced (`listingFormSchema`), and
 *  the range the booking service checks a party against. */
export const MAX_GUESTS_MIN = 1;
export const MAX_GUESTS_MAX = 20;

/**
 * The longest set of written rules this project stores.
 *
 * 1000 characters: long enough for the dozen or so sentences a real house-rules card
 * runs to, short enough that it stays a list of rules rather than a second description
 * — which already has its own field, its own 5000-character limit, and its own place on
 * the listing page. The mobile draft contract and the publish schema both enforce this
 * number by importing it, so there is one limit rather than three.
 */
export const ADDITIONAL_RULES_MAX = 1000;

/** Pets get three answers because hosts really have three. "On request" is the policy
 *  of every host who takes a small dog but not a Great Dane, and it is neither yes nor
 *  no. */
export const PET_POLICIES = ["ALLOWED", "NOT_ALLOWED", "ASK_HOST"] as const;
export type PetPolicy = (typeof PET_POLICIES)[number];

/** Outdoors-only is the most common real smoking rule there is, and a boolean has
 *  nowhere to put it. */
export const SMOKING_POLICIES = ["NOT_ALLOWED", "OUTDOORS_ONLY", "ALLOWED"] as const;
export type SmokingPolicy = (typeof SMOKING_POLICIES)[number];

export const EVENT_POLICIES = ["ALLOWED", "NOT_ALLOWED"] as const;
export type EventPolicy = (typeof EVENT_POLICIES)[number];

/** Whether quiet hours apply at all. Kept apart from the two times so that "there are
 *  none" stays a different fact from "nobody asked" — which is exactly the distinction
 *  a pair of empty time strings cannot make. */
export const QUIET_HOURS_POLICIES = ["NONE", "SET"] as const;
export type QuietHoursPolicy = (typeof QUIET_HOURS_POLICIES)[number];

/** The policy fields, for callers that need to walk them (rows, snapshots, diffs). */
export const HOUSE_RULE_POLICY_FIELDS = [
  "petPolicy",
  "smokingPolicy",
  "eventPolicy",
  "quietHoursPolicy",
] as const;
export type HouseRulePolicyField = (typeof HOUSE_RULE_POLICY_FIELDS)[number];

/**
 * Every row on the screen, in the order a host reads down it.
 *
 * The order is the point: a screen that has to send a host to "the first thing that
 * needs an answer" needs to agree with the page about which one that is, and a second
 * list written somewhere else would eventually disagree.
 */
export const HOUSE_RULE_ROW_ORDER = [
  "checkInTime",
  "checkOutTime",
  "maxGuests",
  "petPolicy",
  "smokingPolicy",
  "eventPolicy",
  "quietHoursPolicy",
  "additionalRules",
] as const;
export type HouseRuleRow = (typeof HOUSE_RULE_ROW_ORDER)[number];

/** How many policies the create flow insists on. */
export const REQUIRED_POLICY_COUNT = HOUSE_RULE_POLICY_FIELDS.length;

export interface ListingHouseRulesInput {
  /** "HH:MM", or `FLEXIBLE_STAY_TIME` for a host who agrees arrival with the guest. */
  checkInTime: string;
  /**
   * The far end of the arrival window — "arrive between 15:00 and 20:00".
   *
   * `FLEXIBLE_STAY_TIME` means the window has no end: arrive any time after `checkInTime`,
   * which is what every listing that predates this field truthfully says and why it is not
   * something the create flow asks for. Never compared against `checkInTime`: a window that
   * runs past midnight (17:00–01:00) is an ordinary thing for a host near an airport to
   * offer, so there is no start-before-end rule to enforce here any more than there is for
   * quiet hours.
   */
  checkInEndTime: string;
  checkOutTime: string;
  maxGuests: number;
  /** null everywhere below means the host has not answered — never "not allowed". */
  petPolicy: PetPolicy | null;
  smokingPolicy: SmokingPolicy | null;
  eventPolicy: EventPolicy | null;
  quietHoursPolicy: QuietHoursPolicy | null;
  /** "HH:MM" when `quietHoursPolicy` is SET, otherwise "". Crossing midnight
   *  (22:00–08:00) is the normal case, so the two are never compared. */
  quietHoursStart: string;
  quietHoursEnd: string;
  /** Exactly what the host wrote, or "" for none. */
  additionalRules: string;
}

export type StayTimeIssue = "NOT_A_TIME";
export type MaxGuestsIssue = "NOT_A_NUMBER" | "TOO_LOW" | "TOO_HIGH";
/** `REQUIRED` is only ever raised with `requireAnswers`, which is the create flow. */
export type PolicyIssue = "REQUIRED" | "NOT_A_CHOICE";
export type QuietHoursTimeIssue = "REQUIRED" | "NOT_A_TIME";
export type AdditionalRulesIssue = "TOO_LONG";

export interface ListingHouseRulesIssues {
  checkInTime?: StayTimeIssue;
  checkInEndTime?: StayTimeIssue;
  checkOutTime?: StayTimeIssue;
  maxGuests?: MaxGuestsIssue;
  petPolicy?: PolicyIssue;
  smokingPolicy?: PolicyIssue;
  eventPolicy?: PolicyIssue;
  quietHoursPolicy?: PolicyIssue;
  quietHoursStart?: QuietHoursTimeIssue;
  quietHoursEnd?: QuietHoursTimeIssue;
  additionalRules?: AdditionalRulesIssue;
}

export interface ListingHouseRulesOptions {
  /**
   * Whether an unanswered policy is a problem.
   *
   * True in the create flow, where the host is being asked right now and Next is the
   * thing that blocks. False in the editor, where a listing published before these
   * columns existed would otherwise open onto a page it cannot save.
   */
  requireAnswers?: boolean;
}

/**
 * A stay time as it will be stored.
 *
 * Null, undefined and whitespace all mean the same thing to a guest — nothing was
 * promised — so they collapse to one value. Anything else is handed on untouched for
 * `houseRulesIssues` to accept or refuse; coercing an unrecognised time to "flexible"
 * here would turn a bad request into a silent change of what the listing promises.
 */
export function normalizeStayTime(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : FLEXIBLE_STAY_TIME;
}

/**
 * One policy value as it will be stored.
 *
 * Anything that is not one of the choices — "", null, a value from a build that offered
 * a fourth option — collapses to null, the unanswered state. A policy is a closed set,
 * so there is no equivalent of the off-grid stay time this deliberately preserves: an
 * unrecognised choice is not a rule anything downstream could render.
 */
function normalizePolicy<T extends string>(
  choices: readonly T[],
  value: unknown,
): T | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return (choices as readonly string[]).includes(trimmed) ? (trimmed as T) : null;
}

export function normalizePetPolicy(value: unknown): PetPolicy | null {
  return normalizePolicy(PET_POLICIES, value);
}

export function normalizeSmokingPolicy(value: unknown): SmokingPolicy | null {
  return normalizePolicy(SMOKING_POLICIES, value);
}

export function normalizeEventPolicy(value: unknown): EventPolicy | null {
  return normalizePolicy(EVENT_POLICIES, value);
}

export function normalizeQuietHoursPolicy(value: unknown): QuietHoursPolicy | null {
  return normalizePolicy(QUIET_HOURS_POLICIES, value);
}

/** Trimmed, truncated nowhere: an over-long value is *reported* by
 *  `additionalRulesIssue` rather than silently cut, because a rule ending mid-sentence
 *  is a rule the host never wrote. */
export function normalizeAdditionalRules(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeListingHouseRules(
  input: ListingHouseRulesInput,
): ListingHouseRulesInput {
  const quietHoursPolicy = normalizeQuietHoursPolicy(input.quietHoursPolicy);
  // A host who turns quiet hours off leaves no half-set pair behind: NONE and a pair of
  // times cannot both be true of one listing, and a stale pair left in the row is how a
  // later read resurrects a rule the host switched off.
  const keepTimes = quietHoursPolicy === "SET";
  return {
    checkInTime: normalizeStayTime(input.checkInTime),
    checkInEndTime: normalizeStayTime(input.checkInEndTime),
    checkOutTime: normalizeStayTime(input.checkOutTime),
    maxGuests: input.maxGuests,
    petPolicy: normalizePetPolicy(input.petPolicy),
    smokingPolicy: normalizeSmokingPolicy(input.smokingPolicy),
    eventPolicy: normalizeEventPolicy(input.eventPolicy),
    quietHoursPolicy,
    quietHoursStart: keepTimes ? normalizeStayTime(input.quietHoursStart) : "",
    quietHoursEnd: keepTimes ? normalizeStayTime(input.quietHoursEnd) : "",
    additionalRules: normalizeAdditionalRules(input.additionalRules),
  };
}

function stayTimeIssue(value: string): StayTimeIssue | undefined {
  if (value === FLEXIBLE_STAY_TIME) return undefined;
  return STAY_TIME_PATTERN.test(value) ? undefined : "NOT_A_TIME";
}

/** A quiet-hours boundary. Unlike a stay time, "" is not a valid answer once the host
 *  has said quiet hours apply — that is a half-answered rule, not a flexible one. */
function quietHoursTimeIssue(value: string): QuietHoursTimeIssue | undefined {
  if (value === FLEXIBLE_STAY_TIME) return "REQUIRED";
  return STAY_TIME_PATTERN.test(value) ? undefined : "NOT_A_TIME";
}

export function additionalRulesIssue(value: string): AdditionalRulesIssue | undefined {
  return value.length > ADDITIONAL_RULES_MAX ? "TOO_LONG" : undefined;
}

function maxGuestsIssue(value: number): MaxGuestsIssue | undefined {
  if (!Number.isInteger(value)) return "NOT_A_NUMBER";
  if (value < MAX_GUESTS_MIN) return "TOO_LOW";
  if (value > MAX_GUESTS_MAX) return "TOO_HIGH";
  return undefined;
}

/**
 * Everything wrong with this input at once.
 *
 * Reported together rather than one at a time: the three controls save as one payload,
 * so making the host fix the guest count to discover the arrival time is also broken
 * would mean two refused saves for one mistake.
 *
 * There is no cross-field rule between the two times, and adding one would be a bug.
 * Check-out at 11:00 with check-in at 15:00 is the normal case — they are on different
 * days, and comparing them as if they were on the same one would reject almost every
 * real listing.
 */
export function listingHouseRulesIssues(
  input: ListingHouseRulesInput,
  options: ListingHouseRulesOptions = {},
): ListingHouseRulesIssues {
  const value = normalizeListingHouseRules(input);
  const issues: ListingHouseRulesIssues = {};
  const checkIn = stayTimeIssue(value.checkInTime);
  if (checkIn) issues.checkInTime = checkIn;
  const checkInEnd = stayTimeIssue(value.checkInEndTime);
  if (checkInEnd) issues.checkInEndTime = checkInEnd;
  const checkOut = stayTimeIssue(value.checkOutTime);
  if (checkOut) issues.checkOutTime = checkOut;
  const guests = maxGuestsIssue(value.maxGuests);
  if (guests) issues.maxGuests = guests;

  // A value that survived normalisation is a value from the closed set, so the only
  // policy fault left to report here is an absent answer — and that is only a fault
  // where the host is being asked. `NOT_A_CHOICE` belongs to callers that validate a
  // raw payload before normalising it; see `listingHouseRulesPayloadIssues`.
  if (options.requireAnswers) {
    for (const field of HOUSE_RULE_POLICY_FIELDS) {
      if (value[field] === null) issues[field] = "REQUIRED";
    }
  }

  // Both ends or neither, always — including in the editor, where a host who says quiet
  // hours apply and leaves one end blank has written a rule no guest could follow.
  if (value.quietHoursPolicy === "SET") {
    const start = quietHoursTimeIssue(value.quietHoursStart);
    if (start) issues.quietHoursStart = start;
    const end = quietHoursTimeIssue(value.quietHoursEnd);
    if (end) issues.quietHoursEnd = end;
  }

  const additional = additionalRulesIssue(value.additionalRules);
  if (additional) issues.additionalRules = additional;

  return issues;
}

/**
 * The same check, for a payload that has not been normalised yet.
 *
 * `listingHouseRulesIssues` normalises first, which reads a policy of "MAYBE" as null —
 * right for a control that has to render something, wrong for a server action, where
 * treating a garbage choice as "unanswered" would store a change the caller never
 * asked for. This reports it instead.
 */
export function listingHouseRulesPayloadIssues(
  input: ListingHouseRulesInput,
  options: ListingHouseRulesOptions = {},
): ListingHouseRulesIssues {
  const issues = listingHouseRulesIssues(input, options);
  const choices: Record<HouseRulePolicyField, readonly string[]> = {
    petPolicy: PET_POLICIES,
    smokingPolicy: SMOKING_POLICIES,
    eventPolicy: EVENT_POLICIES,
    quietHoursPolicy: QUIET_HOURS_POLICIES,
  };
  for (const field of HOUSE_RULE_POLICY_FIELDS) {
    // Read as an unknown: the declared type says this is a choice or null, and the whole
    // point of this function is that a payload off the wire may be neither.
    const value: unknown = input[field];
    // null and "" are both "the host cleared this", which is a legitimate thing to
    // send. Anything else that is not one of the choices is a bad payload.
    if (value === null || value === undefined || value === "") continue;
    if (typeof value !== "string" || !choices[field].includes(value)) {
      issues[field] = "NOT_A_CHOICE";
    }
  }
  return issues;
}

/**
 * The DOM id of one row, built the same way by the rows and by anything that focuses
 * them.
 *
 * A row a host is sent to has to exist, and the surest way for it not to is two copies
 * of this mapping drifting apart.
 */
export function houseRuleRowId(idPrefix: string, row: HouseRuleRow): string {
  switch (row) {
    case "checkInTime":
      return `${idPrefix}-check-in`;
    case "checkOutTime":
      return `${idPrefix}-check-out`;
    case "maxGuests":
      return `${idPrefix}-max-guests`;
    case "petPolicy":
      return `${idPrefix}-pets`;
    case "smokingPolicy":
      return `${idPrefix}-smoking`;
    case "eventPolicy":
      return `${idPrefix}-events`;
    case "quietHoursPolicy":
      return `${idPrefix}-quiet-hours`;
    case "additionalRules":
      return `${idPrefix}-additional-rules`;
  }
}

/**
 * The rows a set of issues belongs to, in page order and without repeats.
 *
 * Both quiet-hours times are edited in the quiet-hours row, so a half-set pair is one
 * problem to fix rather than two entries in a summary pointing at the same sheet.
 */
export function houseRuleRowsWithIssues(
  issues: ListingHouseRulesIssues,
): HouseRuleRow[] {
  const rows = new Set<HouseRuleRow>();
  for (const row of HOUSE_RULE_ROW_ORDER) {
    if (issues[row] !== undefined) rows.add(row);
  }
  if (issues.quietHoursStart || issues.quietHoursEnd) rows.add("quietHoursPolicy");
  return HOUSE_RULE_ROW_ORDER.filter((row) => rows.has(row));
}

/** How many of the required policies now carry an answer. Drives the progress line. */
export function answeredPolicyCount(input: ListingHouseRulesInput): number {
  const value = normalizeListingHouseRules(input);
  return HOUSE_RULE_POLICY_FIELDS.filter((field) => {
    if (value[field] === null) return false;
    // "Set quiet hours" with a missing end is not an answered rule: no guest could
    // follow it, and publishing it would print half a sentence on the listing.
    if (field === "quietHoursPolicy" && value.quietHoursPolicy === "SET") {
      return value.quietHoursStart !== "" && value.quietHoursEnd !== "";
    }
    return true;
  }).length;
}

/** Whether anything at all is wrong. Saves every caller an `Object.keys(...).length`. */
export function listingHouseRulesValid(
  input: ListingHouseRulesInput,
  options: ListingHouseRulesOptions = {},
): boolean {
  return Object.keys(listingHouseRulesIssues(input, options)).length === 0;
}

/** What a listing nobody has asked yet looks like: the industry-standard arrival pair,
 *  two guests, and no answer to anything else. */
export function emptyListingHouseRules(): ListingHouseRulesInput {
  return {
    checkInTime: "15:00",
    // No default window end. "Arrive after 15:00" is what a new listing honestly offers
    // until its host decides they want the door shut by a particular hour.
    checkInEndTime: FLEXIBLE_STAY_TIME,
    checkOutTime: "11:00",
    maxGuests: 2,
    petPolicy: null,
    smokingPolicy: null,
    eventPolicy: null,
    quietHoursPolicy: null,
    quietHoursStart: "",
    quietHoursEnd: "",
    additionalRules: "",
  };
}

/**
 * The times the picker should offer for a stored value.
 *
 * The standard 48 slots, plus the stored one when it is a real time this build would not
 * otherwise show. Without that, opening the tab on an imported listing would present a
 * picker with no way to select what the listing currently says.
 */
export function stayTimeChoices(stored: string): readonly string[] {
  const value = normalizeStayTime(stored);
  if (value === FLEXIBLE_STAY_TIME || STAY_TIME_OPTIONS.includes(value)) {
    return STAY_TIME_OPTIONS;
  }
  if (stayTimeIssue(value)) return STAY_TIME_OPTIONS;
  return [...STAY_TIME_OPTIONS, value].sort();
}

/**
 * Whether a change to the guest count contradicts a stay that is already on the books.
 *
 * Never a reason to refuse the save — the host may have agreed the larger party
 * personally, and the booking service only checks the limit when a *new* request comes
 * in, so lowering it breaks nothing that already exists. It is a reason to say so out
 * loud, because the host cannot see those parties from this screen.
 */
export function conflictsWithBookedParty(
  maxGuests: number,
  largestUpcomingParty: number,
): boolean {
  return largestUpcomingParty > 0 && maxGuests < largestUpcomingParty;
}

/**
 * What a save reports back.
 *
 * Declared here rather than beside the action because a `"use server"` module may only
 * export async functions, and the client needs the shape to reason about the answer.
 */
export interface ListingHouseRulesSaveResult {
  /** A failure the host cannot fix in a control — not signed in, not their listing. */
  error?: string;
  /** Per-field rule violations. Present only when nothing was written. */
  issues?: ListingHouseRulesIssues;
  /** What the listing holds after the write, so the client settles on the server's
   *  answer rather than assuming its optimistic state was accepted. */
  rules?: ListingHouseRulesInput;
  /** When the host last reviewed this section, which is what the editor's completion
   *  tick is a claim about. ISO 8601, or absent when nothing was written. */
  reviewedAt?: string;
}

/**
 * The rules as a guest agreed to them, frozen onto their booking.
 *
 * A plain, self-describing object rather than a foreign key to the listing: the whole
 * point is that it must not change when the host edits their rules tomorrow. `version`
 * is there for the same reason `priceBreakdownVersion` is — a later shape change has to
 * be readable against the rows written before it, not a migration of history.
 *
 * Only ever built on the server, from the listing row. Nothing a client posts reaches
 * this: a snapshot the guest could choose would be a record of what they wanted to
 * agree to rather than of what the listing said.
 */
export interface HouseRulesSnapshot {
  version: 1;
  checkInTime: string | null;
  checkOutTime: string | null;
  maxGuests: number;
  petPolicy: PetPolicy | null;
  smokingPolicy: SmokingPolicy | null;
  eventPolicy: EventPolicy | null;
  quietHoursPolicy: QuietHoursPolicy | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  additionalRules: string | null;
}

/** The columns a snapshot is taken from — exactly the listing row's own field names, so
 *  a `select` can be handed straight in. */
export interface ListingHouseRulesRow {
  checkInTime: string | null;
  /**
   * Optional because most readers of a listing row have no reason to select it. The
   * booking snapshot, the review window and the public rules list all care when a guest
   * may arrive, not by when they must — so absent reads as "no window end", which is
   * the same thing every listing said before this column existed.
   */
  checkInEndTime?: string | null;
  checkOutTime: string | null;
  maxGuests: number;
  petPolicy: string | null;
  smokingPolicy: string | null;
  eventPolicy: string | null;
  quietHoursPolicy: string | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  additionalRules: string | null;
}

/** An empty string is not a rule. Columns hold NULL for "nothing said", and a snapshot
 *  says the same thing the same way. */
function orNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

export function houseRulesSnapshot(listing: ListingHouseRulesRow): HouseRulesSnapshot {
  const quietHoursPolicy = normalizeQuietHoursPolicy(listing.quietHoursPolicy);
  return {
    version: 1,
    checkInTime: orNull(listing.checkInTime),
    checkOutTime: orNull(listing.checkOutTime),
    maxGuests: listing.maxGuests,
    petPolicy: normalizePetPolicy(listing.petPolicy),
    smokingPolicy: normalizeSmokingPolicy(listing.smokingPolicy),
    eventPolicy: normalizeEventPolicy(listing.eventPolicy),
    quietHoursPolicy,
    // Times only mean anything alongside SET, and a snapshot that carried them without
    // it would read as a quiet-hours rule the listing did not have.
    quietHoursStart: quietHoursPolicy === "SET" ? orNull(listing.quietHoursStart) : null,
    quietHoursEnd: quietHoursPolicy === "SET" ? orNull(listing.quietHoursEnd) : null,
    additionalRules: orNull(listing.additionalRules),
  };
}

/** A stored snapshot read back. Anything that is not a v1 object — an older booking's
 *  NULL, a hand-edited row — is simply "no snapshot", never a partial one. */
export function parseHouseRulesSnapshot(value: unknown): HouseRulesSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return null;
  if (typeof raw.maxGuests !== "number" || !Number.isFinite(raw.maxGuests)) return null;
  return houseRulesSnapshot({
    checkInTime: typeof raw.checkInTime === "string" ? raw.checkInTime : null,
    checkOutTime: typeof raw.checkOutTime === "string" ? raw.checkOutTime : null,
    maxGuests: raw.maxGuests,
    petPolicy: typeof raw.petPolicy === "string" ? raw.petPolicy : null,
    smokingPolicy: typeof raw.smokingPolicy === "string" ? raw.smokingPolicy : null,
    eventPolicy: typeof raw.eventPolicy === "string" ? raw.eventPolicy : null,
    quietHoursPolicy:
      typeof raw.quietHoursPolicy === "string" ? raw.quietHoursPolicy : null,
    quietHoursStart:
      typeof raw.quietHoursStart === "string" ? raw.quietHoursStart : null,
    quietHoursEnd: typeof raw.quietHoursEnd === "string" ? raw.quietHoursEnd : null,
    additionalRules:
      typeof raw.additionalRules === "string" ? raw.additionalRules : null,
  });
}

/** A listing row as the shared editing controls express it. The controls have no null
 *  strings — "" is how they say "nothing" — while the policies keep their null, which
 *  is a state the controls genuinely render (no choice selected). */
export function houseRulesFromRow(listing: ListingHouseRulesRow): ListingHouseRulesInput {
  return normalizeListingHouseRules({
    checkInTime: normalizeStayTime(listing.checkInTime),
    checkInEndTime: normalizeStayTime(listing.checkInEndTime),
    checkOutTime: normalizeStayTime(listing.checkOutTime),
    maxGuests: listing.maxGuests,
    petPolicy: normalizePetPolicy(listing.petPolicy),
    smokingPolicy: normalizeSmokingPolicy(listing.smokingPolicy),
    eventPolicy: normalizeEventPolicy(listing.eventPolicy),
    quietHoursPolicy: normalizeQuietHoursPolicy(listing.quietHoursPolicy),
    quietHoursStart: normalizeStayTime(listing.quietHoursStart),
    quietHoursEnd: normalizeStayTime(listing.quietHoursEnd),
    additionalRules: normalizeAdditionalRules(listing.additionalRules),
  });
}

/** The columns a normalised value writes. "" becomes NULL for the same reason the
 *  arrival times always have: that is what every existing row holds, and what the
 *  public page tests before deciding whether to print a rule at all. */
export function houseRulesRowData(rules: ListingHouseRulesInput) {
  const value = normalizeListingHouseRules(rules);
  return {
    checkInTime: value.checkInTime === FLEXIBLE_STAY_TIME ? null : value.checkInTime,
    checkInEndTime:
      value.checkInEndTime === FLEXIBLE_STAY_TIME ? null : value.checkInEndTime,
    checkOutTime: value.checkOutTime === FLEXIBLE_STAY_TIME ? null : value.checkOutTime,
    maxGuests: value.maxGuests,
    petPolicy: value.petPolicy,
    smokingPolicy: value.smokingPolicy,
    eventPolicy: value.eventPolicy,
    quietHoursPolicy: value.quietHoursPolicy,
    quietHoursStart: value.quietHoursStart === "" ? null : value.quietHoursStart,
    quietHoursEnd: value.quietHoursEnd === "" ? null : value.quietHoursEnd,
    additionalRules: value.additionalRules === "" ? null : value.additionalRules,
  };
}

/** Whether two rule sets differ — the editor's "is this worth a write" test, and the
 *  publish path's "did anything change" test. */
export function sameListingHouseRules(
  a: ListingHouseRulesInput,
  b: ListingHouseRulesInput,
): boolean {
  const left = normalizeListingHouseRules(a);
  const right = normalizeListingHouseRules(b);
  return (
    left.checkInTime === right.checkInTime &&
    left.checkInEndTime === right.checkInEndTime &&
    left.checkOutTime === right.checkOutTime &&
    left.maxGuests === right.maxGuests &&
    left.petPolicy === right.petPolicy &&
    left.smokingPolicy === right.smokingPolicy &&
    left.eventPolicy === right.eventPolicy &&
    left.quietHoursPolicy === right.quietHoursPolicy &&
    left.quietHoursStart === right.quietHoursStart &&
    left.quietHoursEnd === right.quietHoursEnd &&
    left.additionalRules === right.additionalRules
  );
}
