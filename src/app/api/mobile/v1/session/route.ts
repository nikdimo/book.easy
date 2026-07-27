import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;

  return mobileJson(request, {
    user: {
      id: access.user.id,
      name: access.user.name,
      email: access.user.email,
      role: access.user.role,
      isHost: access.user.isHost,
    },
  });
}
