import { notFound } from "next/navigation";
import { previewMarketingToken } from "@/lib/services/marketing-consent.service";

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await previewMarketingToken(token, "UNSUBSCRIBE_EMAIL");
  if (!preview) notFound();
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-16">
      <section className="w-full rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-3xl font-semibold">Unsubscribe from marketing</h1>
        <p className="mt-4 text-muted-foreground">
          This stops all promotional email to {preview.email}. Essential account, security,
          payment, and active-booking messages are not affected.
        </p>
        <form action="/api/marketing/unsubscribe" method="post" className="mt-6">
          <input type="hidden" name="token" value={token} />
          <button className="rounded-lg bg-destructive px-5 py-3 font-medium text-destructive-foreground">
            Unsubscribe from all marketing
          </button>
        </form>
      </section>
    </main>
  );
}
