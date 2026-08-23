/**
 * What is left of "Pets allowed" as an amenity.
 *
 * The listing's pet answer used to be a row in `ListingAmenity` pointing at the
 * `pets_allowed` catalog entry. It is now `Listing.petPolicy`, which can say
 * "on request" — something an amenity, being a checkbox, never could. The migration
 * backfilled the policy from the amenity and then deleted those join rows, so there is
 * exactly one place a listing's answer lives.
 *
 * Two things still need the old name, which is why this module exists rather than the
 * constant being deleted with the rows:
 *
 *   1. **Guest search.** `?amenities=Pets+allowed` is a URL guests have bookmarked and
 *      shared, and the filter panel is where they expect to find it. The token stays
 *      exactly what it was; `search.service` translates it into a query against the
 *      policy column instead of a join.
 *   2. **Provider imports.** Airbnb and its peers publish pet rules as free-text amenity
 *      labels. Left alone, the importer would happily recreate a "Pets allowed" amenity
 *      row for every imported listing and hand the project back the second source of
 *      truth it just removed.
 *
 * Free of Prisma and i18n so search, the importer and the tests can all use it.
 */

import type { PetPolicy } from "@/lib/host/v2/listing-house-rules";

/** The catalog row's stable slug. Deactivated, not deleted: aliases and translations
 *  reference its id, and search still names it. */
export const PETS_ALLOWED_AMENITY_KEY = "pets_allowed";

/** The catalog row's name, which *is* the guest-facing filter token. Changing this
 *  string breaks every bookmarked search URL that carries it. */
export const PETS_ALLOWED_AMENITY_NAME = "Pets allowed";

/** Whether a search filter token is the pets one. Case- and space-insensitive, because
 *  a hand-typed URL is still a URL a guest can arrive with. */
export function isPetsAllowedFilter(name: string): boolean {
  return name.trim().toLowerCase() === PETS_ALLOWED_AMENITY_NAME.toLowerCase();
}

/** Comparable form of a label: letters and digits only, so "Pets allowed",
 *  "pets-allowed" and "Pets  Allowed" are one thing. Matches how the importer already
 *  normalises amenity names before looking them up. */
function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Labels that state a pet rule, and what each one says.
 *
 * Ordered most specific first, and matched on the whole normalised label rather than a
 * substring, so "Pets allowed" and "No pets allowed" cannot both match the first
 * pattern. Only unambiguous statements appear here: a label like "Pet bowls" describes
 * equipment, not a policy, and stays an ordinary amenity.
 */
const PET_LABEL_POLICIES: [RegExp, PetPolicy][] = [
  [/^(no|not)pets(allowed)?$/, "NOT_ALLOWED"],
  [/^pets?not(allowed|permitted)$/, "NOT_ALLOWED"],
  [/^(no|not)(dogs|cats|animals)(allowed)?$/, "NOT_ALLOWED"],
  [/^petsonrequest$/, "ASK_HOST"],
  [/^pets(allowed|permitted)?(onrequest|withapproval|byrequest)$/, "ASK_HOST"],
  [/^(ask|contact)(the)?hostabout(pets|animals)$/, "ASK_HOST"],
  [/^pets?(allowed|welcome|friendly|permitted|ok|okay)$/, "ALLOWED"],
  [/^(dogs|cats|animals)(allowed|welcome|friendly|permitted|ok|okay)$/, "ALLOWED"],
  [/^petfriendly$/, "ALLOWED"],
  [/^suitableforpets$/, "ALLOWED"],
];

/** The pet policy one imported label states, or null when it states none. */
export function petPolicyFromAmenityLabel(label: string): PetPolicy | null {
  const normalized = key(label);
  if (!normalized) return null;
  for (const [pattern, policy] of PET_LABEL_POLICIES) {
    if (pattern.test(normalized)) return policy;
  }
  return null;
}

export interface ImportedPetLabels {
  /** What the provider's labels say about pets, or null when they say nothing. */
  petPolicy: PetPolicy | null;
  /** The labels that remain ordinary amenities, in their original order. */
  amenities: string[];
}

/**
 * Splits imported amenity labels into a pet policy and everything else.
 *
 * The first label that states a policy wins, and every pet-stating label is removed
 * whether or not it was the one that won — leaving "Pets allowed" behind as an amenity
 * is exactly the duplicate the migration existed to remove. Providers do occasionally
 * publish both "Pets allowed" and "No pets", which is their bug, not the host's: taking
 * the first keeps the result deterministic, and the host confirms every rule on the
 * House rules step before the draft can be published anyway.
 */
export function splitImportedPetLabels(labels: string[]): ImportedPetLabels {
  let petPolicy: PetPolicy | null = null;
  const amenities: string[] = [];
  for (const label of labels) {
    const policy = petPolicyFromAmenityLabel(label);
    if (policy === null) {
      amenities.push(label);
      continue;
    }
    petPolicy ??= policy;
  }
  return { petPolicy, amenities };
}
