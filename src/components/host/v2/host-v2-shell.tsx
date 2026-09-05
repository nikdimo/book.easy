import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { HostV2Nav } from "@/components/host/v2/host-v2-nav";
import { HostV2AccountMenu } from "@/components/host/v2/host-v2-account-menu";
import { SITE_DOMAIN } from "@/lib/branding";

export function HostV2Shell({
  children,
  userName,
  userEmail,
  isAdmin,
  regionalSettings,
}: {
  children: React.ReactNode;
  userName?: string | null;
  userEmail?: string | null;
  isAdmin?: boolean;
  /** The language/currency dialog, built by the layout because it reads cookies and
   *  rates. Rendered triggerless — the account menu opens it. */
  regionalSettings?: React.ReactNode;
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
    /*
     * `--host-panel-mobile-chrome` is what this shell occupies above and below a page's
     * own content on a phone: the 3rem account row below, plus the 6rem of bottom
     * padding on the content container that keeps the fixed navigation off the work.
     * It is published as a variable because a page that wants to fill the viewport
     * exactly has to subtract it, and the inbox previously subtracted only half of it
     * (the padding, not the account row) and so overflowed the screen by 48px. Only
     * meaningful below `md`, where the header is absent and the document scrolls.
     */
    <div className="flex min-h-dvh flex-col bg-white text-slate-950 [--host-panel-mobile-chrome:9rem] md:h-dvh md:min-h-0 md:overflow-hidden">
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

          {/* One control, not four. Help, language, currency and the way back to the
              booking site were four separate things competing with five centred
              sections for the same row; they are all one tap into the account screen
              now, which is where a host looks for them anyway. */}
          <div className="flex min-w-0 flex-1 items-center justify-end">
            <HostV2AccountMenu
              initials={initials}
              userName={userName}
              userEmail={userEmail}
              isAdmin={isAdmin}
            />
          </div>
        </div>
      </header>

      {/* `overflow-y-auto` rather than `hidden`, so a future page that is simply long
          still scrolls — inside the frame, and with the scrollbar at the viewport edge
          rather than at the 1440px content edge. */}
      {/* The phone has no header, by design — but it still needs somewhere to reach the
          account, and the bottom bar's five slots are all sections. A 3rem row with a
          single right-aligned avatar is the least chrome that does it, and it scrolls
          away with the page rather than sitting on top of the content. Its height is
          `pt-3` plus the avatar's `size-9`; that 3rem is half of
          `--host-panel-mobile-chrome` above, so the two have to move together. */}
      <div className="flex shrink-0 items-center justify-end px-5 pt-3 md:hidden">
        <HostV2AccountMenu
          initials={initials}
          userName={userName}
          userEmail={userEmail}
          isAdmin={isAdmin}
        />
      </div>

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
      {/* Rendered once for the whole panel, at the root rather than inside the account
          menu: the menu closes the moment an item is chosen, and a dialog nested in it
          would unmount with it. */}
      {regionalSettings}
    </div>
  );
}
