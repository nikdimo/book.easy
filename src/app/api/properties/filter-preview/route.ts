import { NextResponse } from "next/server";
import { getSearchFilterPreview, type SearchFilters } from "@/lib/services/search.service";

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
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const filters: SearchFilters = {
      city: parseString(body.city),
      checkIn: parseString(body.checkIn),
      checkOut: parseString(body.checkOut),
      guests: parseNumber(body.guests),
      minPrice: parseNumber(body.minPrice),
      maxPrice: parseNumber(body.maxPrice),
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
