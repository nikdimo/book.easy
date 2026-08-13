import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BecomeHostForm } from "@/components/account/become-host-form";
import { getT, T } from "@/lib/i18n/t";

export const metadata = { title: "Become a Host" };

export default async function BecomeHostPage() {
  const t = await getT();
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.isHost) redirect("/host");

  const profile = await db.profile.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2"><T t={t} k="account.become_host.heading" source="Become a Host" /></h1>
        <p className="text-muted-foreground">
          <T t={t} k="account.become_host.subheading" source="Share your property with travelers and earn income with Linger Homes" />
        </p>
      </div>
      <BecomeHostForm
        existingPhone={profile?.phone || ""}
        userName={session.user.name || ""}
      />
    </div>
  );
}
