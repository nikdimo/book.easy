import {
  LISTING_STEPS,
  resumeListingStep,
  type ListingStepId,
} from "@/lib/constants/listing-steps";
import type { ListingDraftData } from "@/lib/types/listing-draft";

export const HOST_START_DRAFT_COOKIE = "host_start_draft";

export const HOST_START_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  // The wizard persists through `/api/host-start/draft`, so its HTTP-only selector
  // must be sent to both the page routes and that API route.
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

/**
 * Every screen of the host-start wizard, in the order a host walks them.
 *
 * This is the flow's own vocabulary, and the only one that describes it. The eleven-step
 * `LISTING_STEPS` list the mobile app shares has no name for payment arrangements,
 * availability, house rules or review — all four wrote the same `specialOffer` id, so a
 * host who had finished house rules resumed two screens back and one who had only
 * finished pricing resumed past the payment question entirely.
 *
 * The two interstitials are steps a host can be resumed onto: they are where the flow
 * left them, they each carry a Continue button, and skipping past one would land the
 * host on a question they have already answered.
 */
export const HOST_START_ROUTES = [
  "property-type",
  "space-type",
  "location",
  "address",
  "basics",
  "phase-one-complete",
  "amenities",
  "photos",
  "description",
  "phase-two-complete",
  "price",
  "payment-arrangements",
  "availability",
  "house-rules",
  "review",
] as const;

export type HostStartRoute = (typeof HOST_START_ROUTES)[number];

/** Where a draft with nothing to go on resumes. */
export const HOST_START_FIRST_ROUTE: HostStartRoute = "property-type";

const ROUTE_SET = new Set<string>(HOST_START_ROUTES);

export function isHostStartRoute(value: unknown): value is HostStartRoute {
  return typeof value === "string" && ROUTE_SET.has(value);
}

/**
 * The fallback for drafts written before the wizard recorded its own route: the mobile
 * vocabulary's step id → the screen that now asks that question.
 *
 * `specialOffer` is the ambiguous one. Four screens used to write it, meaning four
 * different "next" screens, and nothing in the draft says which. It resolves to the
 * earliest of them — payment arrangements — so a host resumed from an old draft is at
 * worst shown a question they have already answered, never carried past one they have
 * not. Skipping it forwards would publish a listing with no payment methods and no
 * deposit answer, which is the failure this direction is chosen to avoid.
 *
 * Typed as total over `ListingStepId` so adding a step to the shared list is a compile
 * error here rather than a silent fall back to screen one.
 */
const ROUTE_BY_LEGACY_STEP: Record<ListingStepId, HostStartRoute> = {
  propertyType: "property-type",
  spaceType: "space-type",
  location: "location",
  address: "address",
  streetView: "basics",
  details: "basics",
  amenities: "amenities",
  photos: "photos",
  description: "description",
  pricing: "price",
  specialOffer: "payment-arrangements",
};

export function hostStartQuery(data: ListingDraftData): string {
  const params = new URLSearchParams();
  if (data.propertyType) params.set("propertyType", data.propertyType);
  if (data.spaceType) params.set("spaceType", data.spaceType);
  return params.toString();
}

/**
 * Which screen this draft reopens on.
 *
 * The wizard's own route wins when the draft carries one. Everything else is a draft
 * this flow did not write — the mobile app, the classic wizard, the importer, or a row
 * saved before this field existed — and is resolved through the shared step vocabulary,
 * id first and the legacy numeric index only as a last resort, exactly as
 * `resolveMobileDraftStep` does, so the two never disagree about where a host left off.
 */
export function hostStartResumeRoute(data: ListingDraftData): HostStartRoute {
  if (isHostStartRoute(data.currentRoute)) return data.currentRoute;
  const stepIndex = resumeListingStep(data.currentStepId, data.currentStep);
  return ROUTE_BY_LEGACY_STEP[LISTING_STEPS[stepIndex].id];
}

export function hostStartResumeHref(data: ListingDraftData): string {
  const route = hostStartResumeRoute(data);
  const query = hostStartQuery(data);
  return `/host/start/${route}${query ? `?${query}` : ""}`;
}

/**
 * The route a wizard link points at, for the step that is about to save it.
 *
 * Steps already build their own `next` href — from `stepNextTarget`, or by hand where
 * the destination depends on an answer — and re-stating that destination as a literal
 * beside it is how the two drift apart. Reading it back off the href keeps one source.
 */
export function hostStartRouteOf(href: string): HostStartRoute | undefined {
  const path = href.split(/[?#]/, 1)[0];
  const route = path.replace(/^\/host\/start\//, "").replace(/\/$/, "");
  return isHostStartRoute(route) ? route : undefined;
}
