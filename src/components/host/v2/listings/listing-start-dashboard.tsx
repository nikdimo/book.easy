import { ChevronRight, Copy, House, HousePlus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { getT, T } from "@/lib/i18n/t";

export function ListingStartDashboard({
  t,
  firstName,
  draft,
}: {
  t: Awaited<ReturnType<typeof getT>>;
  firstName: string;
  draft?: { id: string; title: string } | null;
}) {
  const greeting = t
    .resolve("host.v2.start_dashboard.greeting", "Welcome back, {name}")
    .text.replace("{name}", firstName);

  return (
    <div className="flex min-h-dvh flex-col bg-white text-[#222]">
      <NewListingHeader t={t} exitHref="/host/listings" />

      <main className="flex flex-1 px-5 pb-16 pt-12 md:px-8 md:pb-24 md:pt-16">
        <div className="mx-auto w-full max-w-[39rem]">
          <h1 className="font-heading text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2rem]">
            {greeting}
          </h1>

          {draft ? <section className="mt-8" aria-labelledby="finish-listing-heading">
            <h2
              id="finish-listing-heading"
              className="font-heading text-xl font-semibold tracking-[-0.015em]"
            >
              <T
                t={t}
                k="host.v2.start_dashboard.finish_heading"
                source="Finish your listing"
              />
            </h2>
            <Link
              href={`/host/start/resume?draft=${encodeURIComponent(draft.id)}`}
              className="mt-4 flex min-h-24 items-center gap-4 rounded-xl border border-slate-300 px-5 py-4 transition-[border-color,box-shadow] hover:border-slate-500 hover:shadow-[0_4px_16px_rgba(15,23,42,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-md bg-slate-100">
                <House className="size-5 fill-slate-900 text-slate-900" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium sm:text-base">
                {draft.title}
              </span>
              <ChevronRight className="size-5 shrink-0 text-slate-500" aria-hidden />
            </Link>
          </section> : null}

          <section className="mt-16" aria-labelledby="start-listing-heading">
            <h2
              id="start-listing-heading"
              className="font-heading text-xl font-semibold tracking-[-0.015em]"
            >
              <T
                t={t}
                k="host.v2.start_dashboard.start_heading"
                source="Start a new listing"
              />
            </h2>
            <div className="mt-5">
              <DashboardAction
                icon={HousePlus}
                href="/host/start/new"
                label={
                  <T
                    t={t}
                    k="host.v2.start_dashboard.create_new"
                    source="Create a new listing"
                  />
                }
              />
              <DashboardAction
                icon={Copy}
                href="/host/start/import"
                label={
                  <T
                    t={t}
                    k="host.v2.start_dashboard.create_existing"
                    source="Create from an existing listing"
                  />
                }
                hint={
                  <T
                    t={t}
                    k="host.v2.start_dashboard.create_existing_hint"
                    source="Paste a link from Airbnb, Booking.com, Facebook and more"
                  />
                }
              />
            </div>
          </section>

          <Link
            href="/host/start?firstTime=1"
            className="mt-8 inline-flex text-xs text-slate-500 underline underline-offset-4 transition-colors hover:text-slate-950"
          >
            <T
              t={t}
              k="host.v2.start_dashboard.preview_first_time"
              source="Preview first-time welcome"
            />
          </Link>
        </div>
      </main>
    </div>
  );
}

function DashboardAction({
  icon: Icon,
  href,
  label,
  hint,
}: {
  icon: LucideIcon;
  href: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-20 items-center gap-4 border-b border-slate-200 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
    >
      <Icon className="size-7 shrink-0 text-slate-900" strokeWidth={1.5} aria-hidden />
      <span className="min-w-0 flex-1 text-sm sm:text-base">
        {label}
        {hint ? (
          <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
        ) : null}
      </span>
      <ChevronRight className="size-5 shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
