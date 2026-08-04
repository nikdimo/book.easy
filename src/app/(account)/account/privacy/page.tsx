import Link from "next/link";
import { requireUserPage } from "@/lib/auth-helpers";
import { PrivacyControls } from "@/components/account/privacy-controls";

export const metadata = { title: "Data & Privacy" };

export default async function PrivacyPage() {
  await requireUserPage("/account/privacy");

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Data &amp; Privacy</h1>
        <p className="text-sm text-muted-foreground">
          Your cookie choices, a copy of everything we hold about you, and account deletion.
        </p>
      </div>

      <PrivacyControls />

      <section className="rounded-xl border bg-muted/30 p-5 text-sm sm:p-6">
        <h2 className="mb-2 font-semibold">Your privacy rights</h2>
        <p className="text-muted-foreground">
          You can access and download your data, correct it from{" "}
          <Link href="/account/profile" className="underline underline-offset-4 hover:text-foreground">
            your profile
          </Link>
          , change your cookie choices at any time, and ask us to erase your account. See the{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/cookies" className="underline underline-offset-4 hover:text-foreground">
            Cookie Policy
          </Link>{" "}
          for the detail, or write to{" "}
          <a
            href="mailto:hello@lingerhomes.com"
            className="underline underline-offset-4 hover:text-foreground"
          >
            hello@lingerhomes.com
          </a>
          .
        </p>
      </section>
    </div>
  );
}
