import { notFound } from "next/navigation";
import { previewMarketingToken } from "@/lib/services/marketing-consent.service";
import { getT, T, TWithValues } from "@/lib/i18n/t";

export default async function ConfirmMarketingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await previewMarketingToken(token, "CONFIRM_EMAIL");
  if (!preview) notFound();
  const translator = await getT();

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-16">
      <section className="w-full rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-3xl font-semibold">
          <T t={translator} k="marketing.confirm.heading" source="Confirm your subscription" />
        </h1>
        <p className="mt-4 text-muted-foreground">
          <TWithValues
            t={translator}
            k="marketing.confirm.body"
            source="Confirm that {email} may receive {audience} marketing emails from Linger Homes."
            values={{ email: preview.email, audience: preview.audience.toLowerCase() }}
            protectedValues={["email"]}
          />
        </p>
        <p className="mt-4 rounded-lg bg-muted p-4 text-sm">{preview.statement}</p>
        <form action="/api/marketing/confirm" method="post" className="mt-6">
          <input type="hidden" name="token" value={token} />
          <button className="rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground">
            <T t={translator} k="marketing.confirm.submit" source="Confirm subscription" />
          </button>
        </form>
      </section>
    </main>
  );
}
