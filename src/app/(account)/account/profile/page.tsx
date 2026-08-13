import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProfileForm } from "@/components/account/profile-form";
import { getT, T } from "@/lib/i18n/t";

export const metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const t = await getT();
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { profile: true },
  });

  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2 text-center sm:text-left">
        <h1 className="text-2xl font-bold"><T t={t} k="account.profile.heading" source="My Profile" /></h1>
        <p className="text-sm text-muted-foreground">
          <T t={t} k="account.profile.subheading" source="Keep your personal details accurate and up to date." />
        </p>
      </div>
      <ProfileForm
        user={{ name: user.name, email: user.email }}
        profile={{
          phone: user.profile?.phone || "",
          bio: user.profile?.bio || "",
        }}
      />

      {/* Deliberately understated: cookie choices, data export and account deletion all
          live one click away rather than as buttons beside "Save Changes". */}
      <p className="rounded-lg border bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
        <T t={t} k="account.profile.privacy_prefix" source="Manage your cookie preferences, download your data, or delete your account in" />{" "}
        <Link
          href="/account/privacy"
          className="underline underline-offset-4 hover:text-foreground"
        >
          <T t={t} k="account.privacy.heading" source={"Data & Privacy"} />
        </Link>
        .
      </p>
    </div>
  );
}
