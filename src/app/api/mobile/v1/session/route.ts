import { mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

/** Who is signed in — deliberately guarded by requireMobileUser, not
 *  requireMobileHost. This endpoint answers "is there a session", and every other
 *  endpoint still enforces its own role. Gating it on host access collapsed two very
 *  different answers into one: a guest who signed in correctly got a 403, the client
 *  read that as "no session", and bounced them back to the sign-in screen they had
 *  just completed — with nothing explaining why. Returning the role lets the app say
 *  so instead. */
export async function GET(request: Request) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access.response;

  const isAdmin = access.user.role === "ADMIN";

  return mobileJson(request, {
    user: {
      id: access.user.id,
      name: access.user.name,
      email: access.user.email,
      role: access.user.role,
      isHost: access.user.isHost,
      /** Whether this account may use the app at all. Admins manage properties too. */
      canManageProperties: access.user.isHost || isAdmin,
    },
  });
}
