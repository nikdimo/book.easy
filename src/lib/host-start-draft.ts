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

const ROUTE_BY_STEP: Record<string, string> = {
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
  specialOffer: "availability",
};

export function hostStartQuery(data: ListingDraftData): string {
  const params = new URLSearchParams();
  if (data.propertyType) params.set("propertyType", data.propertyType);
  if (data.spaceType) params.set("spaceType", data.spaceType);
  return params.toString();
}

export function hostStartResumeHref(data: ListingDraftData): string {
  const route = ROUTE_BY_STEP[data.currentStepId ?? ""] ?? "property-type";
  const query = hostStartQuery(data);
  return `/host/start/${route}${query ? `?${query}` : ""}`;
}
