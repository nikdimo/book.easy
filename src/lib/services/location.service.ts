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
