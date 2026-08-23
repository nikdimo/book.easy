import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { RegionalSettingsTrigger } from "@/components/shared/regional-settings-trigger";
import { getT, T } from "@/lib/i18n/t";
import { SITE_DOMAIN } from "@/lib/branding";

/**
 * The two controls that float at the top of every screen in the new-listing flow.
 *
 * No hairline underneath on purpose — this is not a bar, it is a brand and a way out
 * sitting on an otherwise empty page. `exitHref` is where the flow lets go of the host:
 * back to the panel from the first screen, back one step from anywhere deeper.
 *
 * Language and currency sit beside the exit. The flow has no other chrome — no account
 * menu, no panel header — so without this a host who starts a listing has no way to
 * change either until they leave, and the currency they are about to price a listing in
 * is exactly the thing they might want to change first. The control only opens the
 * dialog; the dialog itself is mounted once by the flow's layout.
 */
export function NewListingHeader({
  t,
  exitHref,
  exitLabel,
  hideOnMobile = false,
}: {
  t: Awaited<ReturnType<typeof getT>>;
  exitHref: string;
  exitLabel?: React.ReactNode;
  hideOnMobile?: boolean;
}) {
  return (
    <header className={`${hideOnMobile ? "hidden lg:flex" : "flex"} shrink-0 items-center justify-between px-5 py-4 md:px-8 md:py-5`}>
      <Link
        href="/"
        aria-label={SITE_DOMAIN}
        translate="no"
        className="shrink-0 rounded-md opacity-90 transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
      >
        <BrandLogo compact className="!h-7 w-auto sm:hidden" />
        <BrandLogo className="hidden !h-8 w-auto sm:inline-flex" />
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        <RegionalSettingsTrigger />
        <Link
          href={exitHref}
          className="inline-flex min-h-9 items-center rounded-full border border-slate-200 px-4 text-[0.8125rem] text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
        >
          {exitLabel ?? <T t={t} k="host.v2.welcome.exit" source="Exit" />}
        </Link>
      </div>
    </header>
  );
}
