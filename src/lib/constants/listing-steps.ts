/** The listing wizard's steps, in order. `id` exists so code can say
 *  LISTING_STEP.streetView instead of a bare index — the indices shifted once already
 *  when Location was split into map / address / Street View, and every hardcoded
 *  number was a place that could silently point at the wrong screen. */
/** Ordered so the live preview stops looking broken: photos, then title/description,
 *  then location and price fill the preview card in the order a guest reads it. The
 *  steps that barely show up in the preview (capacity, amenities) come later, and the
 *  cheapest commitment — picking a property type — still comes first. */
export const LISTING_STEPS = [
  {
    id: "propertyType",
    title: "Property type",
    description: "What kind of place is it?",
  },
  /** Deliberately after propertyType, not beside it. Asking both on one screen is what
   *  let a host read the whole thing as a heading and never realise the tiles were the
   *  question. Property type also decides which answers here are coherent — see
   *  allowedListingSpaceTypes — so it has to be settled first. */
  {
    id: "spaceType",
    title: "What guests book",
    description: "Will guests have the whole place, or a room in it?",
  },
  {
    id: "photos",
    title: "Photos",
    description: "Add your best photo first — it's the one guests see in search.",
  },
  {
    id: "description",
    title: "Title and description",
    description: "Give guests a clear, inviting overview.",
  },
  {
    id: "location",
    title: "Location",
    description: "Place the pin exactly where guests will stay.",
  },
  {
    id: "address",
    title: "Address",
    description: "Check the address we found and fix anything that's off.",
  },
  {
    id: "streetView",
    title: "Street View",
    description: "Show guests how to recognise the place when they arrive.",
  },
  {
    id: "details",
    title: "Property details",
    description: "Set the capacity and sleeping arrangements.",
  },
  { id: "amenities", title: "Amenities", description: "Choose what your property offers." },
  { id: "pricing", title: "Pricing", description: "Set the price and minimum stay." },
  {
    id: "specialOffer",
    title: "Special offer",
    description: "Add an optional discount to attract guests.",
  },
] as const;

export type ListingStepId = (typeof LISTING_STEPS)[number]["id"];

/** Step id → index. */
export const LISTING_STEP = Object.fromEntries(
  LISTING_STEPS.map((step, index) => [step.id, index])
) as Record<ListingStepId, number>;

/** The step id at an index, for persisting a draft's position in a way that survives
 *  the step list being reordered. */
export function listingStepId(index: number): ListingStepId {
  return LISTING_STEPS[normalizeListingStep(index)].id;
}

/** Where to resume a draft. Prefers the stored step id; falls back to the legacy
 *  numeric index for drafts saved before ids existed. Those pre-date the current
 *  order, so the index is approximate — it lands the host on *a* reasonable screen
 *  rather than exactly where they left, and their answers are all still there. */
export function resumeListingStep(
  stepId: unknown,
  legacyIndex: unknown
): number {
  if (typeof stepId === "string") {
    const index = LISTING_STEPS.findIndex((step) => step.id === stepId);
    if (index >= 0) return index;
  }
  return normalizeListingStep(legacyIndex);
}

/** The eleven steps grouped into four named phases, so the wizard header can say
 *  "Your place · 1 of 2" instead of "Step 1 of 11". Eleven is the honest count, but a
 *  host reads it before they have invested anything, which is the cheapest possible
 *  moment for them to decide the whole thing is too long. The screens, their order and
 *  their contents are unchanged — only how the remaining work is described.
 *
 *  Phases must stay contiguous and in step order, and must cover every step exactly
 *  once; listing-steps.test.ts enforces all three, because a phase that silently skips
 *  a step would show a host a progress bar that never fills. */
export const LISTING_PHASES = [
  { id: "place", title: "Your place", steps: ["propertyType", "spaceType"] },
  {
    id: "presentation",
    title: "Photos & description",
    steps: ["photos", "description"],
  },
  {
    id: "location",
    title: "Location",
    steps: ["location", "address", "streetView"],
  },
  {
    id: "offer",
    title: "Details & pricing",
    steps: ["details", "amenities", "pricing", "specialOffer"],
  },
] as const satisfies readonly {
  id: string;
  title: string;
  steps: readonly ListingStepId[];
}[];

export type ListingPhaseId = (typeof LISTING_PHASES)[number]["id"];

/** Step index → phase index, resolved once rather than searched on every render. */
const PHASE_INDEX_BY_STEP: readonly number[] = LISTING_STEPS.map((step) =>
  LISTING_PHASES.findIndex((phase) =>
    (phase.steps as readonly string[]).includes(step.id)
  )
);

/** Which phase a step belongs to, and how far into it the host is. `position` and
 *  `total` are 1-based and phase-local — they are what the header counts. */
export function listingPhaseAt(stepIndex: number) {
  const index = normalizeListingStep(stepIndex);
  const phaseIndex = Math.max(0, PHASE_INDEX_BY_STEP[index] ?? 0);
  const phase = LISTING_PHASES[phaseIndex];
  const position =
    (phase.steps as readonly string[]).indexOf(LISTING_STEPS[index].id) + 1;
  return {
    phase,
    phaseIndex,
    position: Math.max(1, position),
    total: phase.steps.length,
    phaseCount: LISTING_PHASES.length,
  };
}

export function normalizeListingStep(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : 0;

  if (!Number.isInteger(parsed)) return 0;
  return Math.min(LISTING_STEPS.length - 1, Math.max(0, parsed));
}
