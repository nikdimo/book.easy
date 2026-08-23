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
  normalizeQuietHoursPolicy,
  normalizeSmokingPolicy,
  normalizeStayTime,
  type ListingHouseRulesInput,
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
    checkOutTime: normalizeStayTime(data.checkOutTime ?? fallback.checkOutTime),
    // Through the shared parser, not a bare `Number()`: a classic-wizard draft carries
    // "" here, and `Number("")` is 0 — a guest limit publishing refuses.
    maxGuests: capacityCountFromDraft(data.maxGuests, "guests", fallback.maxGuests),
    petPolicy: normalizePetPolicy(data.petPolicy),
    smokingPolicy: normalizeSmokingPolicy(data.smokingPolicy),
    eventPolicy: normalizeEventPolicy(data.eventPolicy),
    quietHoursPolicy: normalizeQuietHoursPolicy(data.quietHoursPolicy),
    quietHoursStart: normalizeStayTime(data.quietHoursStart),
    quietHoursEnd: normalizeStayTime(data.quietHoursEnd),
    additionalRules: normalizeAdditionalRules(data.additionalRules),
  });
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
    quietHoursStart: value.quietHoursStart,
    quietHoursEnd: value.quietHoursEnd,
    additionalRules: value.additionalRules,
  };
}
