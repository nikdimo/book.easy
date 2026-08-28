import { notFound } from "next/navigation";
import { previewMarketingToken } from "@/lib/services/marketing-consent.service";
import { getT, T, TWithValues } from "@/lib/i18n/t";

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await previewMarketingToken(token, "UNSUBSCRIBE_EMAIL");
  if (!preview) notFound();
  const translator = await getT();
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-16">
      <section className="w-full rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-3xl font-semibold">
          <T t={translator} k="unsubscribe.heading" source="Unsubscribe from marketing" />
        </h1>
        <p className="mt-4 text-muted-foreground">
          <TWithValues
            t={translator}
            k="unsubscribe.body"
            source="This stops all promotional email to {email}. Essential account, security, payment, and active-booking messages are not affected."
            values={{ email: preview.email }}
            protectedValues={["email"]}
          />
        </p>
        <form action="/api/marketing/unsubscribe" method="post" className="mt-6">
          <input type="hidden" name="token" value={token} />
          <button className="rounded-lg bg-destructive px-5 py-3 font-medium text-destructive-foreground">
            <T
              t={translator}
              k="unsubscribe.submit"
              source="Unsubscribe from all marketing"
            />
          </button>
        </form>
      </section>
    </main>
  );
}
