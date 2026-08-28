import { getT, T } from "@/lib/i18n/t";

export default async function MarketingConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const translator = await getT();
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-16">
      <section className="w-full rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-3xl font-semibold">
          {error ? (
            <T
              t={translator}
              k="marketing.confirmed.error_heading"
              source="We could not confirm that link"
            />
          ) : (
            <T
              t={translator}
              k="marketing.confirmed.heading"
              source="Subscription confirmed"
            />
          )}
        </h1>
        <p className="mt-4 text-muted-foreground">
          {error ? (
            <T
              t={translator}
              k="marketing.confirmed.error_body"
              source="The link may be invalid, expired, or already used. Please request a new confirmation email."
            />
          ) : (
            <T
              t={translator}
              k="marketing.confirmed.body"
              source="You can unsubscribe from all promotional email at any time. Essential account and booking messages remain separate."
            />
          )}
        </p>
      </section>
    </main>
  );
}
