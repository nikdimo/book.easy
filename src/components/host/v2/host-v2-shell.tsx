import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { BrandLogo } from "@/components/shared/brand-logo";
import { HostV2Nav } from "@/components/host/v2/host-v2-nav";
import { type getT } from "@/lib/i18n/t";
import { SITE_DOMAIN } from "@/lib/branding";

export function HostV2Shell({
  children,
  userName,
  t,
}: {
  children: React.ReactNode;
  userName?: string | null;
  t: Awaited<ReturnType<typeof getT>>;
}) {
  const initials = (userName || "Host")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    /*
     * From `md` up this is a fixed app frame rather than a document: the viewport is
     * the height, the header is the only thing above the work area, and whatever a page
     * puts inside `main` decides for itself what scrolls. That is what lets the calendar
     * hold a rail, a month stream and a management panel side by side without the page
     * itself growing a second scrollbar behind them. Below `md` it stays an ordinary
     * scrolling document, which is what the phone layout and its fixed bottom nav want.
     */
    <div className="flex min-h-dvh flex-col bg-white text-slate-950 md:h-dvh md:min-h-0 md:overflow-hidden">
      {/*
       * Desktop only, and genuinely absent below it — `hidden` rather than a
       * zero-height or transparent row, so a phone gives every pixel of the viewport
       * to the work. A phone host already knows which app they are in; a logo bar
       * across the top of a calendar is the least useful thing that space could hold.
       *
       * One hairline at the bottom is the only edge in here. The row is `items-stretch`
       * so each navigation link can be the full 64px and carry its own underline
       * against that hairline, which is what makes the active section readable without
       * a pill, a chip or a second border.
       */}
      <header className="hidden shrink-0 border-b border-slate-200/70 bg-white md:block">
        <div className="mx-auto flex h-16 max-w-[1440px] items-stretch gap-3 px-6 xl:px-8">
          {/* Left and right are both `flex-1`, so they take equal width and the
              navigation between them sits on the true centre of the header rather
              than on the centre of whatever the logo left over. */}
          <div className="flex min-w-0 flex-1 items-center">
            <Link
              href="/"
              aria-label={SITE_DOMAIN}
              translate="no"
              className="shrink-0 rounded-md opacity-85 transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            >
              {/* The wordmark costs about 120px that a 768px header does not have to
                  spare once five sections are centred in it. Below `lg` the mark
                  carries the brand on its own. */}
              <BrandLogo compact className="!h-8 w-auto lg:hidden" />
              <BrandLogo className="hidden !h-9 w-auto lg:inline-flex" />
            </Link>
          </div>

          <div className="flex shrink-0 items-stretch">
            <HostV2Nav />
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
            <Link
              href="/account/support"
              aria-label={t.resolve("host.v2.help", "Help").text}
              className="grid size-9 shrink-0 place-items-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            >
              <CircleHelp className="size-5" aria-hidden />
            </Link>
            <Link
              href="/account/profile"
              aria-label={t.resolve("host.v2.account", "Account").text}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-[0.8125rem] font-semibold text-slate-800 transition-colors hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            >
              {initials}
            </Link>
          </div>
        </div>
      </header>

      {/* `overflow-y-auto` rather than `hidden`, so a future page that is simply long
          still scrolls — inside the frame, and with the scrollbar at the viewport edge
          rather than at the 1440px content edge. */}
      <main className="flex flex-1 flex-col md:min-h-0 md:overflow-y-auto">
        {/* No top padding below `md`: with the header gone there is nothing above the
            content to be spaced away from, and 20px of white would be exactly the
            empty band removing the header was meant to reclaim. */}
        <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-5 pb-24 pt-0 md:min-h-0 md:px-6 md:pb-5 md:pt-5 xl:px-8">
          {children}
        </div>
      </main>
      <div className="md:hidden">
        <HostV2Nav />
      </div>
    </div>
  );
}
