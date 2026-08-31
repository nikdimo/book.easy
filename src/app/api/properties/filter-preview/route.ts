import { NextResponse } from "next/server";
import { getSearchFilterPreview } from "@/lib/services/search.service";
import type { SearchFilters } from "@/lib/types/search";
import { rateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

function parseNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const items = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );

  return items.length > 0 ? items : undefined;
}

export async function POST(req: Request) {
  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit(`filter-preview:${ip}`, 120, 5 * 60 * 1000);
  if (!limit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;

    const filters: SearchFilters = {
      city: parseString(body.city),
      country: parseString(body.country),
      checkIn: parseString(body.checkIn),
      checkOut: parseString(body.checkOut),
      guests: parseNumber(body.guests),
      minPrice: parseNumber(body.minPrice),
      maxPrice: parseNumber(body.maxPrice),
      // The two bounds mean nothing without the currency they are stated in — the
      // preview count would otherwise compare them against whatever each host quoted
      // in and promise a number of homes the results page does not deliver. A body
      // written before this field existed carries euro numbers, which is what the
      // service's own fallback reads a missing value as.
      currency: parseString(body.currency),
      bedrooms: parseNumber(body.bedrooms),
      propertyTypes: parseStringArray(body.propertyTypes),
      amenities: parseStringArray(body.amenities),
    };

    const preview = await getSearchFilterPreview(filters);
    return NextResponse.json(preview);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to compute filter preview";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
