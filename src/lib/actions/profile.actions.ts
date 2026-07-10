"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function updateProfile(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const name = formData.get("name") as string;
  const phone = formData.get("phone") as string;
  const bio = formData.get("bio") as string;

  if (!name || name.length < 2) return { error: "Name must be at least 2 characters" };

  await db.user.update({
    where: { id: session.user.id },
    data: { name },
  });

  await db.profile.upsert({
    where: { userId: session.user.id },
    update: { phone: phone || null, bio: bio || null },
    create: { userId: session.user.id, phone: phone || null, bio: bio || null },
  });

  revalidatePath("/account/profile");
  return { success: true };
}

export async function becomeHost(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const phone = formData.get("phone") as string;
  const hostBio = formData.get("hostBio") as string;
  const hostDisplayName = formData.get("hostDisplayName") as string;

  if (!phone) return { error: "Phone number is required to become a host" };

  await db.user.update({
    where: { id: session.user.id },
    data: { isHost: true },
  });

  await db.profile.upsert({
    where: { userId: session.user.id },
    update: {
      phone,
      hostBio: hostBio || null,
      hostDisplayName: hostDisplayName || null,
    },
    create: {
      userId: session.user.id,
      phone,
      hostBio: hostBio || null,
      hostDisplayName: hostDisplayName || null,
    },
  });

  revalidatePath("/");
  return { success: true };
}
