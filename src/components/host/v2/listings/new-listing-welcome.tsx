import { ArrowRight, Download, HousePlus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { getT, T } from "@/lib/i18n/t";

/**
 * The first screen of the new-listing flow: one column of type in a white field, and
 * two ways in.
 *
 * Deliberately not a card and not part of the panel shell. A host arriving here has
 * left the panel behind — the only things on screen are the brand, a way out, and the
 * choice they came to make. Everything that is not those three is whitespace.
 *
 * "Start a new listing" is still inert — wiring it to the wizard is a later step, so
 * nothing on this screen creates a draft or touches the server.
 */
export function NewListingWelcome({ t }: { t: Awaited<ReturnType<typeof getT>> }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white text-slate-950">
      <NewListingHeader t={t} exitHref="/host/listings" />

      {/* `items-center` on a `flex-1` main is what centres the column against the
          whole viewport rather than against the text it contains. On a phone the
          padding wins and the block simply sits where it lands, which is what keeps
          it from being pushed under the fold on a short screen. */}
      <main className="flex flex-1 items-center px-5 pb-16 pt-6 md:px-8 md:pb-24">
        <div className="mx-auto w-full max-w-[30rem]">
          <h1 className="font-heading text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] text-slate-950 sm:text-[2rem]">
            <T t={t} k="host.v2.welcome.heading" source="Welcome to Linger Homes" />
          </h1>
          {/* One paragraph, one accent. The commission is the only claim on this page
              worth colour, so it is the only thing that gets any. */}
          <p className="mt-4 text-sm leading-[1.7] text-slate-500">
            <T t={t} k="host.v2.welcome.intro_lead" source="Direct bookings." />{" "}
            <span className="font-medium text-[#0f172a]">
              <T t={t} k="host.v2.welcome.intro_accent" source="0% host commission." />
            </span>{" "}
            <T
              t={t}
              k="host.v2.welcome.intro_rest"
              source="Let's create a listing guests feel confident booking."
            />
          </p>

          <ul className="mt-9">
            <li>
              <WelcomeAction
                icon={HousePlus}
                href="/host/start/new"
                label={<T t={t} k="host.v2.welcome.start" source="Start a new listing" />}
              />
            </li>
            <li>
              <WelcomeAction
                icon={Download}
                href="/host/start/import"
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

          {/* The way back to work already in progress. Grey and underlined rather than
              a third row: it is not a way to start a listing, which is what the rows
              above are for. */}
          <p className="mt-6 text-[0.8125rem] text-slate-500">
            <T
              t={t}
              k="host.v2.welcome.drafts_prompt"
              source="Already started one?"
            />{" "}
            <Link
              href="/host/listings"
              className="underline underline-offset-2 transition-colors hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            >
              <T t={t} k="host.v2.welcome.drafts_link" source="Go to listings" />
            </Link>
          </p>
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
  icon: Icon,
  label,
  hint,
  href,
}: {
  icon: LucideIcon;
  label: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
}) {
  const className =
    "group flex min-h-[4.25rem] w-full items-center gap-4 border-b border-slate-200 py-4 text-left transition-colors hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400";
  const body = (
    <>
      <Icon className="size-5 shrink-0 text-slate-950" strokeWidth={1.5} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-base font-semibold text-slate-950">{label}</span>
        {hint ? (
          <span className="mt-1 block text-[0.8125rem] leading-snug text-slate-500">{hint}</span>
        ) : null}
      </span>
      <ArrowRight className="size-[1.125rem] shrink-0 text-slate-400 transition-colors group-hover:text-slate-900" aria-hidden />
    </>
  );

  // A row that navigates is a link; a row that does not is a button. Not the same
  // element with a prop swapped — middle-click, "open in new tab" and the screen
  // reader's list of links all depend on which one it actually is.
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" className={className}>
      {body}
    </button>
  );
}
