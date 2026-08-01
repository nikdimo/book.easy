import { z } from "zod";
import {
  autocompletePlaces,
  checkStreetViewAvailability,
  getPlaceDetails,
  LocationProviderError,
  reverseGeocode,
} from "@/lib/services/location.service";
import { allowLocationRequest } from "@/lib/utils/location-request";

/** Request shapes and handling for the location lookups, extracted so the mobile
 *  routes under /api/mobile/v1/location reuse exactly what the web routes under
 *  /api/location do. The mobile client cannot call the web routes directly: those
 *  return a plain Response with no CORS headers, so the Expo web preview on :8081
 *  fails preflight against :3000. The wrappers exist for that reason alone — the
 *  validation, the per-user rate limit and the service calls are all shared here so
 *  the two surfaces cannot drift into different rules. */

const languageSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2}$/i)
  .optional();

const coordinateSchema = {
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
};

export const autocompleteSchema = z.object({
  query: z.string().trim().min(2).max(200),
  sessionToken: z.string().trim().min(1).max(200),
  language: languageSchema,
  bias: z.object(coordinateSchema).optional(),
});

export const reverseSchema = z.object({
  ...coordinateSchema,
  language: languageSchema,
});

export const placeDetailsSchema = z.object({
  placeId: z.string().trim().min(1).max(300),
  sessionToken: z.string().trim().min(1).max(200),
  language: languageSchema,
});

export const streetViewSchema = z.object(coordinateSchema);

export interface LocationResult {
  status: number;
  body: unknown;
}

/** Runs one lookup end to end: rate limit, validate, call the service, and map a
 *  provider failure onto the status it reported. Returns a plain result so the
 *  caller decides how to serialise it — mobileJson for the mobile routes. */
export async function handleLocationRequest(
  userId: string,
  kind: "autocomplete" | "reverse" | "place-details" | "street-view",
  input: unknown
): Promise<LocationResult> {
  if (!allowLocationRequest(userId)) {
    return { status: 429, body: { error: "Too many location requests" } };
  }

  try {
    switch (kind) {
      case "autocomplete": {
        const parsed = autocompleteSchema.safeParse(input);
        if (!parsed.success) {
          return { status: 400, body: { error: "Invalid address search" } };
        }
        return { status: 200, body: { results: await autocompletePlaces(parsed.data) } };
      }
      case "reverse": {
        const parsed = reverseSchema.safeParse(input);
        if (!parsed.success) {
          return { status: 400, body: { error: "Invalid coordinates" } };
        }
        return { status: 200, body: { result: await reverseGeocode(parsed.data) } };
      }
      case "place-details": {
        const parsed = placeDetailsSchema.safeParse(input);
        if (!parsed.success) {
          return { status: 400, body: { error: "Invalid place" } };
        }
        return { status: 200, body: { result: await getPlaceDetails(parsed.data) } };
      }
      case "street-view": {
        const parsed = streetViewSchema.safeParse(input);
        if (!parsed.success) {
          return { status: 400, body: { error: "Invalid coordinates" } };
        }
        return {
          status: 200,
          body: { available: await checkStreetViewAvailability(parsed.data) },
        };
      }
    }
  } catch (error) {
    if (error instanceof LocationProviderError) {
      return { status: error.status, body: { error: error.message } };
    }
    return { status: 500, body: { error: "Location lookup failed" } };
  }
}
