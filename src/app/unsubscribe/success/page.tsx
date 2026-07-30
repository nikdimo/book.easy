export default function UnsubscribeSuccessPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-16">
      <section className="w-full rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-3xl font-semibold">You have been unsubscribed</h1>
        <p className="mt-4 text-muted-foreground">
          You will no longer receive promotional email from Linger Homes. We may still send
          messages strictly required for your account, security, payments, listings, or bookings.
        </p>
      </section>
    </main>
  );
}
