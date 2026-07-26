import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkStreetViewAvailability } from "@/lib/services/location.service";
import {
  allowLocationRequest,
  requireHostForLocation,
} from "@/lib/utils/location-request";

const requestSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
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

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const available = await checkStreetViewAvailability(parsed.data);
  return NextResponse.json({ available });
}
