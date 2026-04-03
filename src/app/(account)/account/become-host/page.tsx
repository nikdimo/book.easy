import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BecomeHostForm } from "@/components/account/become-host-form";

export const metadata = { title: "Become a Host" };

export default async function BecomeHostPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.isHost) redirect("/host");

  const profile = await db.profile.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Become a Host</h1>
        <p className="text-muted-foreground">
          Share your property with travelers and earn income on book.easy.mk
        </p>
      </div>
      <BecomeHostForm
        existingPhone={profile?.phone || ""}
        userName={session.user.name || ""}
      />
    </div>
  );
}
