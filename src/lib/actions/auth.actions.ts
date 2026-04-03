"use server";

import { hash } from "bcryptjs";
import { signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { registerSchema } from "@/lib/validations/auth.schema";
import { firstZodMessage } from "@/lib/utils/zod-error";

export async function registerUser(
  formData: FormData
): Promise<{ success: true } | { error: string }> {
  const raw = {
    name: formData.get("name") as string,
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    confirmPassword: formData.get("confirmPassword") as string,
  };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: firstZodMessage(parsed.error) };
  }

  const { name, email, password } = parsed.data;

  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    return { error: "An account with this email already exists" };
  }

  const passwordHash = await hash(password, 12);

  await db.user.create({
    data: {
      name,
      email,
      passwordHash,
      profile: { create: {} },
    },
  });

  return { success: true };
}

/** Server-side sign-out (e.g. from a Server Action form). Prefer client `signOut` in the header for speed. */
export async function logoutUser() {
  await signOut({ redirectTo: "/" });
}
