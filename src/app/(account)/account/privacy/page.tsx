import Link from "next/link";
import { requireUserPage } from "@/lib/auth-helpers";
import { PrivacyControls } from "@/components/account/privacy-controls";
import { getT, T } from "@/lib/i18n/t";

export const metadata = { title: "Data & Privacy" };

export default async function PrivacyPage() {
  const t = await getT();
  await requireUserPage("/account/privacy");

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold"><T t={t} k="account.privacy.heading" source={"Data & Privacy"} /></h1>
        <p className="text-sm text-muted-foreground">
          <T t={t} k="account.privacy.subheading" source="Your cookie choices, a copy of everything we hold about you, and account deletion." />
        </p>
      </div>

      <PrivacyControls />

      <section className="rounded-xl border bg-muted/30 p-5 text-sm sm:p-6">
        <h2 className="mb-2 font-semibold"><T t={t} k="account.privacy.rights" source="Your privacy rights" /></h2>
        <p className="text-muted-foreground">
          <T t={t} k="account.privacy.rights_prefix" source="You can access and download your data, correct it from" />{" "}
          <Link href="/account/profile" className="underline underline-offset-4 hover:text-foreground">
            <T t={t} k="account.privacy.your_profile" source="your profile" />
          </Link>
          {" "}<T t={t} k="account.privacy.rights_middle" source="change your cookie choices at any time, and ask us to erase your account. See the" />{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            <T t={t} k="account.privacy.policy" source="Privacy Policy" />
          </Link>{" "}
          <T t={t} k="common.and" source="and" />{" "}
          <Link href="/cookies" className="underline underline-offset-4 hover:text-foreground">
            <T t={t} k="account.privacy.cookie_policy" source="Cookie Policy" />
          </Link>{" "}
          <T t={t} k="account.privacy.contact_prefix" source="for the detail, or write to" />{" "}
          <a
            href="mailto:hello@lingerhomes.com"
            className="underline underline-offset-4 hover:text-foreground"
          >
            <span translate="no">hello@lingerhomes.com</span>
          </a>
          .
        </p>
      </section>
    </div>
  );
}
