import {
  registerPushToken,
  unregisterPushToken,
} from "@/lib/services/notification.service";
import { mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function POST(request: Request) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access.response;

  let input: { token?: string; platform?: string; deviceName?: string };
  try {
    input = await request.json();
  } catch {
    return mobileJson(request, { error: "Invalid JSON body" }, { status: 400 });
  }
  if (!input.token || !["ios", "android"].includes(input.platform ?? "")) {
    return mobileJson(request, { error: "A valid token and platform are required" }, { status: 400 });
  }

  try {
    await registerPushToken({
      userId: access.user.id,
      token: input.token,
      platform: input.platform!,
      deviceName: input.deviceName?.slice(0, 120),
    });
    return mobileJson(request, { success: true });
  } catch (error) {
    return mobileJson(
      request,
      { error: error instanceof Error ? error.message : "Could not register device" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access.response;

  let input: { token?: string };
  try {
    input = await request.json();
  } catch {
    return mobileJson(request, { error: "Invalid JSON body" }, { status: 400 });
  }
  if (!input.token) {
    return mobileJson(request, { error: "Push token is required" }, { status: 400 });
  }

  await unregisterPushToken(access.user.id, input.token);
  return mobileJson(request, { success: true });
}
