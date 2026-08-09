/**
 * When the property starts taking bookings — the one question the create wizard makes
 * every host answer before it will publish.
 *
 * Availability used to be an optional card on the pre-publish checklist: a host who
 * skipped it published a listing that was bookable from that moment on every date,
 * which is how people ended up with requests for nights they were living in the place.
 * The answer is now required, and it is stored rather than inferred, so "the host never
 * said" stays distinguishable from "the host said available now".
 *
 * Deliberately at the bottom of the import graph: listing-prepublish-plan.ts imports
 * this module, so this one imports nothing but the civil-date helpers and the two
 * cannot form a cycle. That is also why the block/night helpers below take structural
 * `{ startDate, endDate }` shapes instead of the plan's own types.
 */

import { addDaysToYmd, compareYmd, todayYmd } from "@/lib/utils/date-only";

/** A calendar day as `YYYY-MM-DD`, matching the plan's civil-date convention: no
 *  timezone, so it cannot drift a day depending on where the host's browser is. */
export type AvailabilityDate = string;

export type AvailabilityStart =
  | { mode: "now" }
  | { mode: "from"; startDate: AvailabilityDate }
  | { mode: "selected" };

/**
 * `null` is a real state, not a missing value: the host has not answered yet. Every
 * draft saved before this screen existed looks exactly like this, and so does a draft
 * whose stored answer was malformed. It is never quietly read as "available now" —
 * publishing is refused until the host says which one it is.
 */
export type AvailabilityStartChoice = AvailabilityStart | null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates a civil date by hand rather than via `new Date(string)`, which accepts a
 *  dozen other formats and rolls 2026-02-30 forward into March. */
function validDate(value: unknown): AvailabilityDate | null {
  if (typeof value !== "string" || !DATE_RE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

/**
 * Draft-shaped input → a choice. Lenient in one direction only: anything unrecognised
 * becomes `null` (ask again), never a guess at what the host meant.
 *
 * A well-formed but past start date is kept rather than dropped, so a host resuming an
 * old draft sees the date they picked with an error against it instead of an empty
 * screen that silently forgot their answer. `validateAvailabilityStartForPublish` is
 * where a past date is actually refused.
 */
export function parseAvailabilityStart(raw: unknown): AvailabilityStartChoice {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  if (input.mode === "now") return { mode: "now" };
  if (input.mode === "selected") return { mode: "selected" };
  if (input.mode === "from") {
    const startDate = validDate(input.startDate);
    return startDate ? { mode: "from", startDate } : null;
  }
  return null;
}

export type AvailabilityStartRejection =
  | "unconfirmed"
  | "invalid-date"
  | "past-date";

/**
 * The publish-time gate. Returns a reason rather than a boolean so the caller can say
 * which of the three problems it is — "confirm when guests can book" and "that start
 * date has passed" send the host to different fixes.
 *
 * Note what this deliberately does not do: an invalid or missing choice is never
 * downgraded to `{ mode: "now" }`. Publishing a listing as bookable today because its
 * stored answer failed to parse is the exact failure this screen exists to prevent.
 */
export function validateAvailabilityStartForPublish(
  choice: AvailabilityStartChoice,
  today: AvailabilityDate = todayYmd(),
):
  | { ok: true; value: AvailabilityStart }
  | { ok: false; reason: AvailabilityStartRejection } {
  if (!choice) return { ok: false, reason: "unconfirmed" };
  if (choice.mode === "now") return { ok: true, value: { mode: "now" } };
  if (choice.mode === "selected") {
    return { ok: true, value: { mode: "selected" } };
  }

  const startDate = validDate(choice.startDate);
  if (!startDate) return { ok: false, reason: "invalid-date" };
  if (compareYmd(startDate, today) < 0) {
    return { ok: false, reason: "past-date" };
  }
  return { ok: true, value: { mode: "from", startDate } };
}

/**
 * The availability start as a block of nights nobody can book.
 *
 * "Available from 1 September" means 1 September is the first night a guest may check
 * in, so the nights blocked run from today up to and including 31 August. Returned as
 * an **inclusive** range — the same convention the host's own blocked ranges use — so
 * it goes through `planRangeToDbRange` with everything else and picks up the database's
 * exclusive end date there. Converting it here as well would move the boundary twice
 * and cost the host the first bookable night.
 *
 * Null when there is nothing to block: "available now", a start of today, or a start
 * already in the past — nights before today are not bookable regardless.
 */
export function availabilityStartBlock(
  start: AvailabilityStart,
  today: AvailabilityDate = todayYmd(),
): { startDate: AvailabilityDate; endDate: AvailabilityDate } | null {
  if (start.mode === "now" || start.mode === "selected") return null;
  const startDate = validDate(start.startDate);
  if (!startDate) return null;

  const lastBlockedNight = addDaysToYmd(startDate, -1);
  if (compareYmd(lastBlockedNight, today) < 0) return null;
  return { startDate: today, endDate: lastBlockedNight };
}

/**
 * How many nights the host has blocked by hand.
 *
 * Nights rather than ranges, and de-duplicated: "8 blocked nights" is the number a host
 * recognises as what they did, where "2 ranges" could equally be two nights or a
 * fortnight. Overlapping ranges collapse instead of double-counting.
 */
export function blockedNightsCount(
  blocks: readonly { startDate: string; endDate: string }[],
): number {
  const nights = new Set<string>();
  for (const block of blocks) {
    const start = validDate(block.startDate);
    const end = validDate(block.endDate);
    if (!start || !end || compareYmd(end, start) < 0) continue;
    let cursor = start;
    while (compareYmd(cursor, end) <= 0) {
      nights.add(cursor);
      cursor = addDaysToYmd(cursor, 1);
    }
  }
  return nights.size;
}

/**
 * Whether Publish has to stay held.
 *
 * Editing an existing listing never passes through this screen — a published listing's
 * availability is edited on its own calendar, where it has always been required — so
 * the gate is a create-wizard rule and returns false outright when editing.
 */
export function availabilityBlocksPublish({
  isEditing,
  availabilityStart,
  today,
}: {
  isEditing: boolean;
  availabilityStart: AvailabilityStartChoice;
  today?: AvailabilityDate;
}): boolean {
  if (isEditing) return false;
  return !validateAvailabilityStartForPublish(availabilityStart, today).ok;
}
