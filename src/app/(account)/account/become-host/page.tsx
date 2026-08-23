import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hostPanelDestination } from "@/lib/host/host-panel-preference";
import { db } from "@/lib/db";
import { BecomeHostForm } from "@/components/account/become-host-form";
import { getT, T } from "@/lib/i18n/t";

export const metadata = { title: "Become a Host" };

export default async function BecomeHostPage() {
  const t = await getT();
  const session = await auth();
  // Keep the destination through the login round trip, or signing in drops you on the
  // booking home page instead of the page you were trying to open.
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/account/become-host")}`);
  }

  if (session.user.isHost) {
    // One panel, so nothing to look up: an existing host goes to Host V2. Reading a
    // remembered version here is what used to drop hosts who had never switched into
    // the classic panel, which no longer receives work.
    redirect(hostPanelDestination());
  }

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
