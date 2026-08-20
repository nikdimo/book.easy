import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { getT, T } from "@/lib/i18n/t";
import { SITE_DOMAIN } from "@/lib/branding";

/**
 * The first screen of the new-listing flow: one column of type in a white field, and
 * two ways in.
 *
 * Deliberately not a card and not part of the panel shell. A host arriving here has
 * left the panel behind — the only things on screen are the brand, a way out, and the
 * choice they came to make. Everything that is not those three is whitespace.
 *
 * UI only for now: both rows are inert buttons. Wiring them to the wizard and to the
 * import flow is a later step, so nothing here creates a draft or touches the server.
 */
export function NewListingWelcome({ t }: { t: Awaited<ReturnType<typeof getT>> }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white text-slate-950">
      {/* No hairline under this row. The header is not a bar, it is two controls
          floating at the top of an otherwise empty page. */}
      <header className="flex shrink-0 items-center justify-between px-5 py-4 md:px-8 md:py-5">
        <Link
          href="/"
          aria-label={SITE_DOMAIN}
          translate="no"
          className="shrink-0 rounded-md opacity-90 transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
        >
          <BrandLogo compact className="!h-7 w-auto sm:hidden" />
          <BrandLogo className="hidden !h-8 w-auto sm:inline-flex" />
        </Link>
        <Link
          href="/host/v2/listings"
          className="inline-flex min-h-9 items-center rounded-full border border-slate-200 px-4 text-[0.8125rem] text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
        >
          <T t={t} k="host.v2.welcome.exit" source="Exit" />
        </Link>
      </header>

      {/* `items-center` on a `flex-1` main is what centres the column against the
          whole viewport rather than against the text it contains. On a phone the
          padding wins and the block simply sits where it lands, which is what keeps
          it from being pushed under the fold on a short screen. */}
      <main className="flex flex-1 items-center px-5 pb-16 pt-6 md:px-8 md:pb-24">
        <div className="mx-auto w-full max-w-[27.5rem]">
          <h1 className="text-[1.625rem] font-medium leading-[1.2] tracking-[-0.01em] text-slate-950">
            <T t={t} k="host.v2.welcome.heading" source="Welcome to Linger Homes" />
          </h1>
          {/* One paragraph, one accent. The commission is the only claim on this page
              worth colour, so it is the only thing that gets any. */}
          <p className="mt-3.5 text-[0.8125rem] leading-[1.75] text-slate-500">
            <T t={t} k="host.v2.welcome.intro_lead" source="Direct bookings." />{" "}
            <span className="font-medium text-[#d1603d]">
              <T t={t} k="host.v2.welcome.intro_accent" source="0% host commission." />
            </span>{" "}
            <T
              t={t}
              k="host.v2.welcome.intro_rest"
              source="Let's create a listing guests feel confident booking."
            />
          </p>

          <ul className="mt-8">
            <li>
              <WelcomeAction label={<T t={t} k="host.v2.welcome.start" source="Start a new listing" />} />
            </li>
            <li>
              <WelcomeAction
                label={<T t={t} k="host.v2.welcome.import" source="Import listing" />}
                hint={
                  <T
                    t={t}
                    k="host.v2.welcome.import_hint"
                    source="Airbnb, Booking, Vrbo or anywhere else"
                  />
                }
              />
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}

/**
 * A row rather than a button: at this size a filled pill would be the loudest thing on
 * a page whose whole argument is quiet. `min-h-14` keeps the tap target honest on a
 * phone even though the row carries no background of its own.
 */
function WelcomeAction({
  label,
  hint,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="flex min-h-14 w-full items-center gap-4 border-b border-slate-100 py-3.5 text-left transition-colors hover:border-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-slate-950">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-xs leading-snug text-slate-400">{hint}</span>
        ) : null}
      </span>
      <ArrowRight className="size-4 shrink-0 text-slate-400" aria-hidden />
    </button>
  );
}
