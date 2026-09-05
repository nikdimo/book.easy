/**
 * House rules on their way through a `ListingDraft`.
 *
 * A draft holds strings, because it holds whatever a half-finished form had in it and
 * has no columns to be wrong about. The rules the two editing screens work with are a
 * typed value. This is the only place those two shapes meet, so a field added to one
 * cannot quietly fail to arrive in the other.
 *
 * Separate from `listing-house-rules.ts` so that module stays free of the draft
 * contract, which the mobile app and the classic wizard also write.
 */

import {
  capacityCountFromDraft,
} from "@/lib/host/v2/listing-capacity";
import {
  emptyListingHouseRules,
  normalizeAdditionalRules,
  normalizeEventPolicy,
  normalizeListingHouseRules,
  normalizePetPolicy,
  normalizeQuietHoursPeriods,
  normalizeQuietHoursPolicy,
  normalizeSmokingPolicy,
  normalizeStayTime,
  type ListingHouseRulesInput,
  type QuietHoursPeriod,
} from "@/lib/host/v2/listing-house-rules";
import type { ListingDraftData } from "@/lib/types/listing-draft";

/** Every draft key this section owns. The save whitelist and the publish form both
 *  walk this list rather than repeating it, which is what stops a new rule from being
 *  stored on the draft and then silently dropped at publish. */
export const HOUSE_RULES_DRAFT_FIELDS = [
  "checkInTime",
  "checkOutTime",
  "maxGuests",
  "petPolicy",
  "smokingPolicy",
  "eventPolicy",
  "quietHoursPolicy",
  // JSON, but a string like everything else here, so the two places that turn a draft
  // into a publish `FormData` need no special case for it.
  "quietHoursPeriods",
  "quietHoursStart",
  "quietHoursEnd",
  "additionalRules",
] as const;

export type HouseRulesDraftField = (typeof HOUSE_RULES_DRAFT_FIELDS)[number];

/**
 * The rules a draft is carrying.
 *
 * `fallback` supplies the arrival pair and guest count for a draft that has not reached
 * this step yet — the flow pre-fills those three, and a blank guest count would read as
 * an invalid answer rather than an unasked question. The policies have no such
 * fallback: unanswered is exactly what they are, and the step is about to ask.
 */
export function houseRulesFromDraft(
  data: ListingDraftData,
  fallback: ListingHouseRulesInput = emptyListingHouseRules(),
): ListingHouseRulesInput {
  return normalizeListingHouseRules({
    // `normalizeStayTime` keeps an imported off-grid "14:15" rather than rewriting it,
    // and turns anything that is not a time at all into "flexible".
    checkInTime: normalizeStayTime(data.checkInTime ?? fallback.checkInTime),
    // Not a draft field: the create flow never asks for the far end of the arrival
    // window, so a draft carries whatever the fallback says — "flexible" for a new
    // listing. The Arrival guide's check-in card is where a host narrows it, after
    // publishing.
    checkInEndTime: normalizeStayTime(fallback.checkInEndTime),
    checkOutTime: normalizeStayTime(data.checkOutTime ?? fallback.checkOutTime),
    // Through the shared parser, not a bare `Number()`: a classic-wizard draft carries
    // "" here, and `Number("")` is 0 — a guest limit publishing refuses.
    maxGuests: capacityCountFromDraft(data.maxGuests, "guests", fallback.maxGuests),
    petPolicy: normalizePetPolicy(data.petPolicy),
    smokingPolicy: normalizeSmokingPolicy(data.smokingPolicy),
    eventPolicy: normalizeEventPolicy(data.eventPolicy),
    quietHoursPolicy: normalizeQuietHoursPolicy(data.quietHoursPolicy),
    quietHoursPeriods: draftQuietHoursPeriods(data),
    quietHoursStart: normalizeStayTime(data.quietHoursStart),
    quietHoursEnd: normalizeStayTime(data.quietHoursEnd),
    additionalRules: normalizeAdditionalRules(data.additionalRules),
  });
}

/**
 * The draft's periods, with the legacy pair still able to win.
 *
 * Everywhere else the stored list is authoritative, because everywhere else the pair is
 * derived from it. A draft is the one place two different clients write the same rule:
 * the web flow stores the whole list, and a client that knows only
 * `quietHoursStart`/`quietHoursEnd` patches those on their own. When the pair disagrees
 * with the first stored period, that client is the one that just edited the rule, so its
 * answer replaces that period — and clearing the pair clears the list, which is what a
 * client with one pair of fields means by it. The periods below the first are left alone:
 * they are a list the other client never saw and has no opinion about.
 */
function draftQuietHoursPeriods(
  data: ListingDraftData,
): QuietHoursPeriod[] | undefined {
  // Unparseable JSON is read as "no array", which falls back to the pair. A draft is
  // half-finished work, and refusing to read one over a malformed field the host never
  // saw would cost them the rest of it.
  const stored = parseDraftQuietHoursPeriods(data.quietHoursPeriods);
  if (!stored || stored.length === 0) return undefined;
  const start = normalizeStayTime(data.quietHoursStart);
  const end = normalizeStayTime(data.quietHoursEnd);
  if (stored[0].start === start && stored[0].end === end) return stored;
  if (start === "" && end === "") return [];
  return [{ start, end }, ...stored.slice(1)];
}

function parseDraftQuietHoursPeriods(
  value: string | undefined,
): QuietHoursPeriod[] | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeQuietHoursPeriods(parsed) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The draft patch that stores a rule set.
 *
 * Every field is written on every save, including the empty ones. A patch merges over
 * what is already stored, so omitting a cleared field would leave the old answer in the
 * draft — which is precisely how a host who switches quiet hours off would find them
 * back on when they resume.
 */
export function houseRulesDraftPatch(
  rules: ListingHouseRulesInput,
): Pick<ListingDraftData, HouseRulesDraftField> {
  const value = normalizeListingHouseRules(rules);
  return {
    checkInTime: value.checkInTime,
    checkOutTime: value.checkOutTime,
    maxGuests: String(value.maxGuests),
    petPolicy: value.petPolicy ?? "",
    smokingPolicy: value.smokingPolicy ?? "",
    eventPolicy: value.eventPolicy ?? "",
    quietHoursPolicy: value.quietHoursPolicy ?? "",
    // Always written, empty list included, for the reason above: a patch merges, so a
    // host who removed their second quiet period and resumed the flow later would find
    // it back if this were omitted when the list is empty.
    quietHoursPeriods: JSON.stringify(value.quietHoursPeriods),
    quietHoursStart: value.quietHoursStart,
    quietHoursEnd: value.quietHoursEnd,
    additionalRules: value.additionalRules,
  };
}
