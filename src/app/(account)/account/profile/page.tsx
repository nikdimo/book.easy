import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProfileForm } from "@/components/account/profile-form";

export const metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { profile: true },
  });

  if (!user) redirect("/login");

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">My Profile</h1>
      <ProfileForm
        user={{ name: user.name, email: user.email }}
        profile={{
          phone: user.profile?.phone || "",
          bio: user.profile?.bio || "",
        }}
      />
    </div>
  );
}
