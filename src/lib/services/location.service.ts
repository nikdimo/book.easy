import "server-only";

const GEOAPIFY_BASE_URL = "https://api.geoapify.com/v1";
const REQUEST_TIMEOUT_MS = 5_000;

export type GeocodedLocation = {
  id: string;
  label: string;
  address: string;
  city: string;
  area: string;
  postalCode: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  placeId: string;
  confidence?: number;
};

type GeoapifyAddress = {
  address_line1?: string;
  formatted?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  suburb?: string;
  district?: string;
  county?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
  lat?: number;
  lon?: number;
  place_id?: string;
  rank?: {
    confidence?: number;
  };
};

type GeoapifySearchResponse = {
  results?: GeoapifyAddress[];
};

type GeoapifyIpResponse = {
  city?: { name?: string };
  country?: { name?: string; iso_code?: string };
  location?: { latitude?: number; longitude?: number };
};

export class LocationProviderError extends Error {
  constructor(
    message: string,
    readonly status = 502
  ) {
    super(message);
  }
}

function apiKey() {
  const key = process.env.GEOAPIFY_API_KEY?.trim();
  if (!key) {
    throw new LocationProviderError("Address search is not configured", 503);
  }
  return key;
}

async function geoapifyFetch<T>(
  pathname: string,
  params: Record<string, string>
): Promise<T> {
  const url = new URL(`${GEOAPIFY_BASE_URL}${pathname}`);
  for (const [name, value] of Object.entries(params)) {
    if (value) url.searchParams.set(name, value);
  }
  url.searchParams.set("apiKey", apiKey());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new LocationProviderError(
        response.status === 429
          ? "Address search is temporarily busy"
          : "The location provider could not complete the request",
        response.status === 429 ? 429 : 502
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof LocationProviderError) throw error;
    throw new LocationProviderError(
      error instanceof Error && error.name === "AbortError"
        ? "The location request timed out"
        : "The location provider is unavailable"
    );
  } finally {
    clearTimeout(timeout);
  }
}

function toGeocodedLocation(result: GeoapifyAddress): GeocodedLocation | null {
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const address =
    result.address_line1?.trim() ||
    [result.street, result.housenumber].filter(Boolean).join(" ").trim() ||
    result.formatted?.trim() ||
    "";
  const city =
    result.city?.trim() ||
    result.town?.trim() ||
    result.village?.trim() ||
    result.municipality?.trim() ||
    "";
  const area =
    result.suburb?.trim() ||
    result.district?.trim() ||
    result.county?.trim() ||
    "";
  const placeId = result.place_id?.trim() || "";
  const label =
    result.formatted?.trim() ||
    [address, city, result.country].filter(Boolean).join(", ");

  return {
    id: placeId || `${latitude},${longitude}:${label}`,
    label,
    address,
    city,
    area,
    postalCode: result.postcode?.trim() || "",
    country: result.country?.trim() || "",
    countryCode: result.country_code?.trim().toUpperCase() || "",
    latitude,
    longitude,
    placeId,
    confidence:
      typeof result.rank?.confidence === "number"
        ? result.rank.confidence
        : undefined,
  };
}

export async function autocompleteAddress(input: {
  query: string;
  language?: string;
  bias?: { latitude: number; longitude: number };
}): Promise<GeocodedLocation[]> {
  const response = await geoapifyFetch<GeoapifySearchResponse>(
    "/geocode/autocomplete",
    {
      text: input.query,
      format: "json",
      limit: "6",
      lang: input.language || "en",
      bias: input.bias
        ? `proximity:${input.bias.longitude},${input.bias.latitude}`
        : "",
    }
  );

  return (response.results ?? [])
    .map(toGeocodedLocation)
    .filter((result): result is GeocodedLocation => result !== null);
}

export async function reverseGeocode(input: {
  latitude: number;
  longitude: number;
  language?: string;
}): Promise<GeocodedLocation | null> {
  const response = await geoapifyFetch<GeoapifySearchResponse>(
    "/geocode/reverse",
    {
      lat: String(input.latitude),
      lon: String(input.longitude),
      format: "json",
      limit: "1",
      lang: input.language || "en",
    }
  );

  return response.results?.[0]
    ? toGeocodedLocation(response.results[0])
    : null;
}

export async function locateIp(ip: string): Promise<{
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  countryCode: string;
} | null> {
  const response = await geoapifyFetch<GeoapifyIpResponse>("/ipinfo", { ip });
  const latitude = Number(response.location?.latitude);
  const longitude = Number(response.location?.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    city: response.city?.name?.trim() || "",
    country: response.country?.name?.trim() || "",
    countryCode: response.country?.iso_code?.trim().toUpperCase() || "",
  };
}

// ─── Google Places (address + business/POI search) ─────────────────────────────
//
// Separate, server-only key from NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: Places
// Autocomplete/Details are billed APIs, and this key is only ever used in
// server-to-server calls below — it must never end up in the client bundle the way
// the Embed/Street-View key intentionally does.

const GOOGLE_PLACES_BASE_URL = "https://maps.googleapis.com/maps/api/place";

// Basic Data tier only (cheapest) — deliberately excludes Contact/Atmosphere fields
// (phone, opening hours, reviews, ratings, etc.) that would bill at a higher tier and
// that this app has no use for.
const PLACE_DETAILS_FIELDS = "place_id,name,formatted_address,geometry,address_component";

export type PlacePrediction = {
  placeId: string;
  /** Google's own formatted suggestion text — safe to show in a dropdown even for a
   *  business result, since only the *selected* result's address fields (not this
   *  label) ever get written into the listing's Address field. */
  label: string;
};

function placesApiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) {
    throw new LocationProviderError("Address search is not configured", 503);
  }
  return key;
}

type GooglePlacesErrorStatus =
  | "ZERO_RESULTS"
  | "OVER_QUERY_LIMIT"
  | "REQUEST_DENIED"
  | "INVALID_REQUEST"
  | "UNKNOWN_ERROR";

async function googlePlacesFetch<T extends { status: string; error_message?: string }>(
  pathname: string,
  params: Record<string, string>
): Promise<T> {
  const url = new URL(`${GOOGLE_PLACES_BASE_URL}${pathname}`);
  for (const [name, value] of Object.entries(params)) {
    if (value) url.searchParams.set(name, value);
  }
  url.searchParams.set("key", placesApiKey());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      throw new LocationProviderError(
        response.status === 429
          ? "Address search is temporarily busy"
          : "The location provider could not complete the request",
        response.status === 429 ? 429 : 502
      );
    }
    const payload = (await response.json()) as T;
    // ZERO_RESULTS is a normal, successful "nothing matched" — every other non-OK
    // status is a real configuration or quota problem worth surfacing distinctly.
    if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
      const status = payload.status as GooglePlacesErrorStatus;
      throw new LocationProviderError(
        status === "OVER_QUERY_LIMIT"
          ? "Address search is temporarily busy"
          : payload.error_message || "The location provider could not complete the request",
        status === "OVER_QUERY_LIMIT" ? 429 : 502
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof LocationProviderError) throw error;
    throw new LocationProviderError(
      error instanceof Error && error.name === "AbortError"
        ? "The location request timed out"
        : "The location provider is unavailable"
    );
  } finally {
    clearTimeout(timeout);
  }
}

type GooglePlaceAutocompleteResponse = {
  status: string;
  error_message?: string;
  predictions?: { place_id: string; description: string }[];
};

/**
 * Address/business/POI search-as-you-type. Pass the same `sessionToken` for every
 * keystroke of one search plus the getPlaceDetails call that follows a selection —
 * Google bills that whole sequence as one cheap "session" instead of per request.
 * Generate a fresh UUID per new search (see the client's session-token handling).
 */
export async function autocompletePlaces(input: {
  query: string;
  sessionToken: string;
  language?: string;
  bias?: { latitude: number; longitude: number };
}): Promise<PlacePrediction[]> {
  const response = await googlePlacesFetch<GooglePlaceAutocompleteResponse>(
    "/autocomplete/json",
    {
      input: input.query,
      sessiontoken: input.sessionToken,
      language: input.language || "en",
      // Biases (doesn't restrict) toward the current map view, same as the previous
      // Geoapify search — a 50km radius is generous enough to still surface a well-known
      // place just outside it while favoring nearby results.
      location: input.bias ? `${input.bias.latitude},${input.bias.longitude}` : "",
      radius: input.bias ? "50000" : "",
    }
  );

  return (response.predictions ?? []).map((prediction) => ({
    placeId: prediction.place_id,
    label: prediction.description,
  }));
}

type GooglePlaceDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    place_id: string;
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
    address_components?: { long_name: string; short_name: string; types: string[] }[];
  };
};

function addressComponent(
  components: { long_name: string; short_name: string; types: string[] }[],
  ...types: string[]
): string {
  for (const type of types) {
    const match = components.find((component) => component.types.includes(type));
    if (match) return match.long_name;
  }
  return "";
}

/**
 * Resolves a place the host picked from autocomplete into full coordinates and address
 * fields. Deliberately builds `address` from the street_number/route components rather
 * than Google's own formatted_address or the place's name — for a business/POI result,
 * formatted_address often leads with the business name, and putting e.g. "Hotel
 * Aphrodite" in a listing's actual street address field would be wrong, not just
 * untidy. If a place has no street-level component at all (some rural POIs don't),
 * `address` comes back empty and the host fills it in, same as any other geocode miss.
 */
export async function getPlaceDetails(input: {
  placeId: string;
  sessionToken: string;
  language?: string;
}): Promise<GeocodedLocation | null> {
  const response = await googlePlacesFetch<GooglePlaceDetailsResponse>("/details/json", {
    place_id: input.placeId,
    sessiontoken: input.sessionToken,
    language: input.language || "en",
    fields: PLACE_DETAILS_FIELDS,
  });

  const result = response.result;
  const latitude = result?.geometry?.location?.lat;
  const longitude = result?.geometry?.location?.lng;
  if (!result || typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }

  const components = result.address_components ?? [];
  const streetNumber = addressComponent(components, "street_number");
  const route = addressComponent(components, "route");
  const city = addressComponent(components, "locality", "postal_town", "administrative_area_level_3");
  const area = addressComponent(components, "sublocality", "neighborhood", "administrative_area_level_2");
  const country = addressComponent(components, "country");
  const countryCode =
    components.find((component) => component.types.includes("country"))?.short_name.toUpperCase() ||
    "";

  return {
    id: result.place_id,
    label: result.formatted_address || [route, city, country].filter(Boolean).join(", "),
    address: [streetNumber, route].filter(Boolean).join(" "),
    city,
    area: area === city ? "" : area,
    postalCode: addressComponent(components, "postal_code"),
    country,
    countryCode,
    latitude,
    longitude,
    placeId: result.place_id,
  };
}

type StreetViewMetadataResponse = {
  status?: string;
};

/**
 * Whether Google has Street View imagery near a point, checked via the Street View
 * Static API's metadata endpoint — unlike the image endpoint, metadata requests are
 * not billed, so this is free to call before deciding whether to render a preview.
 * Coverage is sparse in rural areas (much of rural Greece included), and Google's embed
 * shows a broken-looking default view rather than failing cleanly when there's no
 * nearby panorama, so this check is what lets the UI show nothing instead of that.
 */
export async function checkStreetViewAvailability(input: {
  latitude: number;
  longitude: number;
}): Promise<boolean> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return false;

  const url = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  url.searchParams.set("location", `${input.latitude},${input.longitude}`);
  url.searchParams.set("key", key);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return false;
    const payload = (await response.json()) as StreetViewMetadataResponse;
    return payload.status === "OK";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
