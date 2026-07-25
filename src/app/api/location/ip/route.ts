import { NextRequest, NextResponse } from "next/server";
import {
  LocationProviderError,
  locateIp,
} from "@/lib/services/location.service";
import {
  allowLocationRequest,
  clientIpFromRequest,
  deploymentLocationFromHeaders,
  requireHostForLocation,
} from "@/lib/utils/location-request";

export async function POST(request: NextRequest) {
  const userId = await requireHostForLocation();
  if (!userId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  if (!allowLocationRequest(`${userId}:ip`, 10)) {
    return NextResponse.json(
      { error: "Too many location requests" },
      { status: 429 }
    );
  }

  const deploymentLocation = deploymentLocationFromHeaders(request);
  if (deploymentLocation) {
    return NextResponse.json({ result: deploymentLocation });
  }

  const ip = clientIpFromRequest(request);
  if (!ip) return NextResponse.json({ result: null });

  try {
    const result = await locateIp(ip);
    return NextResponse.json({ result });
  } catch (error) {
    const status = error instanceof LocationProviderError ? error.status : 500;
    const message =
      error instanceof LocationProviderError
        ? error.message
        : "IP location failed";
    return NextResponse.json({ error: message }, { status });
  }
}
