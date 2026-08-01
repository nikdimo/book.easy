import { mobileJson, mobileOptions } from "@/lib/mobile-api";
import {
  createMobileSessionToken,
  readMobileHandoffToken,
} from "@/lib/mobile-session-token";
import { db } from "@/lib/db";

export function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function POST(request: Request) {
  let input: { handoff?: string };
  try {
    input = await request.json();
  } catch {
    return mobileJson(request, { error: "Invalid JSON body" }, { status: 400 });
  }
  if (!input.handoff) {
    return mobileJson(request, { error: "Handoff token is required" }, { status: 400 });
  }
  const userId = await readMobileHandoffToken(input.handoff);
  if (!userId) {
    return mobileJson(request, { error: "Sign-in handoff expired" }, { status: 401 });
  }
  const user = await db.user.findFirst({
    where: { id: userId, isActive: true },
    select: { id: true },
  });
  if (!user) return mobileJson(request, { error: "Account is unavailable" }, { status: 401 });
  return mobileJson(request, { token: await createMobileSessionToken(user.id) });
}
