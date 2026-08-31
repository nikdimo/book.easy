/**
 * The Review screen's safety net: everything about a draft that would make publishing
 * fail, expressed as blockers a host can act on.
 *
 * Every step of the create flow validates the fields it owns before it will navigate,
 * so a host who walks the flow start to finish should never see any of this. It exists
 * for the drafts that did not arrive that way:
 *
 *   - legacy drafts written by the classic wizard, whose steps do not map one-to-one
 *     onto this flow and which can carry blank or out-of-range values;
 *   - imported listings, which arrive at Review with whatever the provider gave us;
 *   - drafts edited in a second tab, so the answer this tab validated is no longer the
 *     answer on the server;
 *   - cross-step conflicts and business rules no single step owns (a free-cleaning
 *     offer on a listing with no cleaning fee is nobody's field, but it fails publish).
 *
 * Nothing here is authoritative. `submitNewListing` remains the only gate that decides
 * whether a listing is created; this module exists so the host reads a sentence next to
 * a link to the step that owns it instead of a toast carrying a raw Zod message. Every
 * rule below is derived from a constant the server also uses — see the imports — so the
 * two cannot drift apart silently.
 *
 * Free of i18n and JSX, like the per-step rule modules beside it. The messages are
 * plain English for the same reason `listing-wizard-validation` uses them: they name
 * server rules, and the alternative is a translation key per failure mode for a screen
 * a host walking the flow normally never sees.
 */

import {
  CAPACITY_BOUNDS,
  CAPACITY_FIELDS,
  capacityCountFromDraft,
  listingCapacityIssues,
  type CapacityField,
} from "@/lib/host/v2/listing-capacity";
import {
  DESCRIPTION_MIN,
  TITLE_MIN,
  listingBasicsIssues,
} from "@/lib/host/v2/listing-basics";
import {
  ADDRESS_MIN,
  CITY_MIN,
  COUNTRY_MIN,
  listingLocationIssues,
  validCoordinates,
} from "@/lib/host/v2/listing-location";
import {
  MAX_STORED_MONEY_INTEGER,
  NIGHTLY_PRICE_MIN,
  nightlyPriceIssue,
} from "@/lib/host/v2/listing-nightly-price";
import { MIN_PUBLISH_PHOTOS } from "@/lib/host/v2/photo-draft";
import {
  HOUSE_RULE_POLICY_FIELDS,
  listingHouseRulesIssues,
  type HouseRulePolicyField,
} from "@/lib/host/v2/listing-house-rules";
import { houseRulesFromDraft } from "@/lib/host/v2/listing-house-rules-draft";
import { promotionWizardIssues } from "@/lib/host/listing-wizard-validation";
import { validateAvailabilityStartForPublish } from "@/lib/types/listing-availability-start";
import { allowedListingSpaceTypes } from "@/lib/types/listing-space-type";
import type { ListingDraftData } from "@/lib/types/listing-draft";
import { validateListingPaymentMethods } from "@/lib/payments/payment-methods";
import { validatePaymentInstructionTemplates } from "@/lib/payments/payment-instruction-templates";
import {
  depositPoliciesCurrency,
  depositPoliciesDraftMatchesCurrency,
  depositPoliciesDraftIsValid,
  parseDepositPoliciesDraft,
} from "@/lib/host/v2/listing-deposit-draft";
import { validateCancellationPolicy } from "@/lib/payments/cancellation-policy";

/** The screens of the create flow a blocker can send a host back to. */
export const FLOW_STEPS = [
  "property-type",
  "space-type",
  "location",
  "address",
  "basics",
  "amenities",
  "photos",
  "description",
  "price",
  "payment-arrangements",
  "availability",
  "house-rules",
] as const;

export type FlowStepId = (typeof FLOW_STEPS)[number];

export interface PublishBlocker {
  /** Which screen owns the field. The Review list links here. */
  step: FlowStepId;
  /** One sentence naming what is missing or wrong, in the host's terms. */
  message: string;
}

/** The route a blocker's "Fix this" link points at, carrying the flow's own query. */
export function flowStepHref(step: FlowStepId, query: string): string {
  return `/host/start/${step}?${query}`;
}

const CURRENCY_RE = /^[A-Z]{3}$/;
const STAY_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const CAPACITY_LABELS: Record<CapacityField, string> = {
  guests: "guests",
  bedrooms: "bedrooms",
  beds: "beds",
  bathrooms: "bathrooms",
};

/** Which `ListingDraftData` key holds a capacity count. Only the guest one differs. */
function capacityDraftKey(field: CapacityField) {
  return field === "guests" ? ("maxGuests" as const) : field;
}

/**
 * Every reason this draft cannot be published, in flow order.
 *
 * Ordered by step rather than by severity, so the list reads like the flow the host just
 * walked and the first entry is the earliest screen they have to go back to.
 *
 * `today` is the marketplace's civil date, passed in rather than read here so the "that
 * date has passed" rule agrees with the server's, which is computed in the same zone.
 * Omitting it falls back to the same default the publish gate uses.
 */
export function publishBlockers(
  data: ListingDraftData,
  options: { today?: string } = {},
): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];
  const add = (step: FlowStepId, message: string) => blockers.push({ step, message });

  // --- Property type and what guests book -----------------------------------------
  const propertyType = (data.propertyType ?? "").trim();
  if (propertyType === "") {
    add("property-type", "Choose the kind of place you are listing.");
  }

  const spaceType = data.spaceType;
  if (!spaceType) {
    add("space-type", "Choose what guests will book.");
  } else if (
    propertyType !== "" &&
    !allowedListingSpaceTypes(propertyType).some((option) => option.value === spaceType)
  ) {
    // The property type changed after the space type was picked. Neither field is wrong
    // on its own, and Review is the only screen that sees both.
    add("space-type", "That guest space does not match your property type. Choose again.");
  }

  // --- Location: the address text, and the pin -------------------------------------
  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);
  const pinned =
    (data.latitude ?? "").trim() !== "" &&
    (data.longitude ?? "").trim() !== "" &&
    validCoordinates(latitude, longitude);

  const locationIssues = listingLocationIssues(
    {
      address: data.address ?? "",
      city: data.city ?? "",
      area: data.area ?? "",
      postalCode: data.postalCode ?? "",
      country: data.country ?? "",
      pin: null,
      streetView: null,
    },
    pinned ? { latitude, longitude } : { latitude: null, longitude: null },
  );

  if (locationIssues.address) {
    add("address", "Add the street address (at least " + ADDRESS_MIN + " characters).");
  }
  if (locationIssues.city) {
    add("address", "Add the city or town (at least " + CITY_MIN + " characters).");
  }
  if (locationIssues.country) {
    add("address", "Choose the country (at least " + COUNTRY_MIN + " characters).");
  }
  if (locationIssues.postalCode) {
    add("address", "That postcode is too long.");
  }
  if (locationIssues.area) {
    add("address", "That apartment, suite or unit line is too long.");
  }
  if (locationIssues.pin) {
    // The pin itself, never a second confirmation of it: a draft carrying coordinates is
    // a draft whose host placed them, and Review does not ask them to say so again.
    add("location", "Place your property on the map so guests can find it.");
  }

  // --- Capacity ---------------------------------------------------------------------
  // A blank count is genuinely unanswered rather than zero, so it is reported as
  // missing; `capacityCountFromDraft` is handed NaN as its fallback precisely so the
  // two stay distinguishable.
  const capacity = {
    guests: capacityCountFromDraft(data.maxGuests, "guests", Number.NaN),
    bedrooms: capacityCountFromDraft(data.bedrooms, "bedrooms", Number.NaN),
    beds: capacityCountFromDraft(data.beds, "beds", Number.NaN),
    bathrooms: capacityCountFromDraft(data.bathrooms, "bathrooms", Number.NaN),
  };
  const capacityIssues = listingCapacityIssues(capacity);
  for (const field of CAPACITY_FIELDS) {
    const stored = (data[capacityDraftKey(field)] ?? "").trim();
    const issue = capacityIssues[field];
    if (stored === "" || issue === "NOT_A_NUMBER") {
      add("basics", "Say how many " + CAPACITY_LABELS[field] + " your place has.");
      continue;
    }
    if (issue) {
      const { min, max } = CAPACITY_BOUNDS[field];
      add(
        "basics",
        "Number of " + CAPACITY_LABELS[field] + " must be between " + min + " and " + max + ".",
      );
    }
  }

  // --- Photos -------------------------------------------------------------------------
  const images = (data.mediaItems ?? []).filter((item) => item.mediaType === "IMAGE");
  if (images.length < MIN_PUBLISH_PHOTOS) {
    add("photos", "Add at least " + MIN_PUBLISH_PHOTOS + " photos before publishing.");
  }

  // --- Title and description ------------------------------------------------------------
  const basicsIssues = listingBasicsIssues({
    title: data.title ?? "",
    description: data.description ?? "",
  });
  if (basicsIssues.title) {
    add(
      "description",
      basicsIssues.title === "TOO_LONG"
        ? "Your title is too long."
        : "Give your place a title of at least " + TITLE_MIN + " characters.",
    );
  }
  if (basicsIssues.description) {
    add(
      "description",
      basicsIssues.description === "TOO_LONG"
        ? "Your description is too long."
        : "Write a description of at least " + DESCRIPTION_MIN + " characters.",
    );
  }

  // --- Price and currency ----------------------------------------------------------------
  // Currency-specific typo guards belong to the Price step, where the current rate
  // table can translate the EUR reference guard into the listing's denomination.
  // Review has no rate snapshot and must not reapply a bare 100,000 ceiling to DKK,
  // MKD or VND. It still protects the actual Decimal storage boundary.
  const priceIssue = nightlyPriceIssue(
    data.baseNightlyRate ?? "",
    MAX_STORED_MONEY_INTEGER,
  );
  if (priceIssue) {
    add(
      "price",
      priceIssue === "TOO_HIGH"
        ? "That nightly price is too high."
        : "Set a nightly price of at least " + NIGHTLY_PRICE_MIN + ".",
    );
  }

  // Blank is fine: publishing falls back to the platform default. Only a currency the
  // draft actually carries and that no `PricingRule` could hold is a blocker — and the
  // one it carries is never replaced here.
  const currency = (data.currency ?? "").trim().toUpperCase();
  if (currency !== "" && !CURRENCY_RE.test(currency)) {
    add("price", "Choose a valid currency for your listing.");
  }

  const storedCleaningFee = (data.cleaningFee ?? "").trim();
  const cleaningFee = storedCleaningFee === "" ? 0 : Number(storedCleaningFee);
  if (storedCleaningFee !== "" && (!Number.isFinite(cleaningFee) || cleaningFee < 0)) {
    add("price", "That cleaning fee is not a valid amount.");
  }

  // The launch offer has no screen of its own in this flow, so these can only come from
  // an imported or legacy draft. Pricing is the nearest screen a host can act on.
  for (const issue of promotionWizardIssues({
    promotionType: data.promotionType ?? "",
    promotionPercent: data.promotionPercent ?? "",
    promotionMinimumNights: data.promotionMinimumNights ?? "",
    promotionFreeCleaning: data.promotionFreeCleaning ?? "",
  })) {
    add("price", issue.message);
  }
  const freeCleaning =
    data.promotionFreeCleaning === "true" || data.promotionType === "FREE_CLEANING";
  if (freeCleaning && (!Number.isFinite(cleaningFee) || cleaningFee <= 0)) {
    add("price", "Add a cleaning fee before offering free cleaning.");
  }

  // --- Payment arrangements -------------------------------------------------------------
  const paymentMethods = validateListingPaymentMethods({
    methods: data.acceptedPaymentMethods ?? [],
    otherLabel: data.paymentMethodOther ?? null,
  });
  if (!paymentMethods.success) {
    add(
      "payment-arrangements",
      "Choose at least one payment method guests can select.",
    );
  } else {
    const templates = validatePaymentInstructionTemplates(
      data.paymentInstructionTemplates ?? {},
      paymentMethods.value.methods,
    );
    if (!templates.success) {
      add(
        "payment-arrangements",
        "Review or shorten the saved private payment instructions.",
      );
    }
  }

  // The deposit answer. Absent is the case this catches: a draft started before the
  // wizard asked, imported from a provider, or begun in the mobile app. Publishing one
  // freezes `UNANSWERED` deposit terms onto every booking it takes — which the guest
  // reads as "the host never answered", not as "no deposit" — and raises an incomplete
  // payment-arrangements task the moment the listing goes live.
  //
  // Asking for neither is a complete answer and passes here; not having been asked is
  // what fails. The draft is never defaulted to "no deposit" for the same reason a
  // blank house-rule policy is not defaulted to "not allowed": it would put terms on a
  // live listing that its host never chose.
  const depositPolicies = parseDepositPoliciesDraft(data.depositPolicies);
  if (!depositPolicies) {
    add(
      "payment-arrangements",
      "Answer the advance payment and damage deposit questions.",
    );
  } else if (
    !depositPoliciesDraftMatchesCurrency(
      depositPolicies,
      depositPoliciesCurrency(data),
    )
  ) {
    add(
      "payment-arrangements",
      "Review the deposit amounts after changing the listing currency.",
    );
  } else if (
    !depositPoliciesDraftIsValid(depositPolicies, depositPoliciesCurrency(data))
  ) {
    add(
      "payment-arrangements",
      "Check the deposit amounts and timing.",
    );
  }

  const cancellation = validateCancellationPolicy(
    data.freeCancellationDaysBeforeCheckIn,
  );
  if (!cancellation.success) {
    add(
      "payment-arrangements",
      cancellation.issue === "REQUIRED"
        ? "Choose the free-cancellation deadline."
        : "Free-cancellation days must be a whole number from 0 to 3650.",
    );
  }

  // --- Availability -----------------------------------------------------------------------
  const availability = validateAvailabilityStartForPublish(
    data.prePublishPlan?.availabilityStart ?? null,
    options.today,
  );
  if (!availability.ok) {
    add(
      "availability",
      availability.reason === "past-date"
        ? "That availability start date has already passed. Choose today or a later date."
        : availability.reason === "invalid-date"
          ? "Choose a valid date for when guests can start booking."
          : "Confirm when guests can start booking.",
    );
  }
  const storedMinNights = (data.minNights ?? "").trim();
  const minNights = Number(storedMinNights);
  if (storedMinNights !== "" && (!Number.isInteger(minNights) || minNights < 1)) {
    add("availability", "Minimum stay must be at least 1 night.");
  }

  // --- House rules --------------------------------------------------------------------------
  // "" is a deliberate "flexible", which publishing accepts. Only a stored value that is
  // neither blank nor a real time would be silently rewritten, so it is surfaced.
  for (const [field, label] of [
    ["checkInTime", "check-in"],
    ["checkOutTime", "check-out"],
  ] as const) {
    const value = (data[field] ?? "").trim();
    if (value !== "" && !STAY_TIME_RE.test(value)) {
      add("house-rules", "That " + label + " time is not a valid time of day.");
    }
  }

  // The structured policies. The step that asks these refuses to move on until they are
  // answered, so a host walking the flow never reaches this — it is here for the drafts
  // that arrived some other way: imported listings, drafts started in the mobile app,
  // and rows written before this screen existed. Every message names the missing rule
  // and links back to the one screen that can answer it.
  //
  // Deliberately reported as missing rather than defaulted at publish. A blank policy
  // published as "not allowed" would put a rule on a live listing that its host never
  // chose, which is the whole reason these columns are nullable.
  const rules = houseRulesFromDraft(data);
  const ruleIssues = listingHouseRulesIssues(rules, { requireAnswers: true });
  const RULE_LABELS: Record<HouseRulePolicyField, string> = {
    petPolicy: "whether pets are allowed",
    smokingPolicy: "whether smoking is allowed",
    eventPolicy: "whether parties and events are allowed",
    quietHoursPolicy: "whether quiet hours apply",
  };
  for (const field of HOUSE_RULE_POLICY_FIELDS) {
    if (ruleIssues[field]) add("house-rules", "Say " + RULE_LABELS[field] + ".");
  }
  if (ruleIssues.quietHoursStart || ruleIssues.quietHoursEnd) {
    add("house-rules", "Set both a start and an end time for quiet hours.");
  }
  if (ruleIssues.additionalRules) {
    add("house-rules", "Your additional house rules are too long.");
  }

  return blockers;
}

/** Whether Publish may run at all. */
export function readyToPublish(
  data: ListingDraftData,
  options: { today?: string } = {},
): boolean {
  return publishBlockers(data, options).length === 0;
}
