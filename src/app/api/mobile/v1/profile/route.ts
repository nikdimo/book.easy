import { updateProfile } from "@/lib/actions/profile.actions";
import { db } from "@/lib/db";
import { mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";

/** The signed-in account's own details. Guarded by requireMobileUser rather than
 *  requireMobileHost: everyone with a session has a profile, and editing your own
 *  name is not a hosting action. Saving delegates to updateProfile, the same action
 *  the web account page posts to. */
export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access.response;

  const user = await db.user.findUnique({
    where: { id: access.user.id },
    select: {
      name: true,
      email: true,
      role: true,
      isHost: true,
      profile: { select: { phone: true, bio: true } },
    },
  });
  if (!user) {
    return mobileJson(request, { error: "Profile not found" }, { status: 404 });
  }

  return mobileJson(request, {
    profile: {
      name: user.name ?? "",
      email: user.email ?? "",
      role: user.role,
      isHost: user.isHost,
      phone: user.profile?.phone ?? "",
      bio: user.profile?.bio ?? "",
    },
  });
}

export async function PUT(request: Request) {
  const access = await requireMobileUser(request);
  if ("response" in access) return access.response;

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    phone?: string;
    bio?: string;
  } | null;
  if (!body) {
    return mobileJson(request, { error: "Invalid profile" }, { status: 400 });
  }

  const formData = new FormData();
  formData.set("name", body.name ?? "");
  formData.set("phone", body.phone ?? "");
  formData.set("bio", body.bio ?? "");

  const result = await updateProfile(formData);
  if ("error" in result) {
    return mobileJson(request, { error: result.error }, { status: 400 });
  }
  return mobileJson(request, { success: true });
}
