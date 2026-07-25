import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  autocompleteAddress,
  LocationProviderError,
} from "@/lib/services/location.service";
import {
  allowLocationRequest,
  requireHostForLocation,
} from "@/lib/utils/location-request";

const requestSchema = z.object({
  query: z.string().trim().min(3).max(200),
  language: z.string().trim().regex(/^[a-z]{2}$/i).optional(),
  bias: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const userId = await requireHostForLocation();
  if (!userId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  if (!allowLocationRequest(userId)) {
    return NextResponse.json(
      { error: "Too many location requests" },
      { status: 429 }
    );
  }

  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid address search" }, { status: 400 });
    }
    const results = await autocompleteAddress(parsed.data);
    return NextResponse.json({ results });
  } catch (error) {
    const status = error instanceof LocationProviderError ? error.status : 500;
    const message =
      error instanceof LocationProviderError
        ? error.message
        : "Address search failed";
    return NextResponse.json({ error: message }, { status });
  }
}
