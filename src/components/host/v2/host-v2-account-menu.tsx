"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  ArrowLeftRight,
  CalendarDays,
  Globe,
  Heart,
  Home,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MessageCircle,
  ShieldCheck,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { REGIONAL_SETTINGS_OPEN_EVENT } from "@/components/shared/regional-settings-event";
import { Tx, useI18n } from "@/lib/i18n/client";
import { CurrencyMark } from "@/components/shared/currency-mark";
import { useDisplayCurrency } from "@/lib/currency/client";
import { currencyDisplayName } from "@/lib/currency/currencies";
import { normalizeLocaleCode } from "@/lib/i18n/locale-preference";
import { cn } from "@/lib/utils";

/*
 * The booking site's account menu, carried into the host panel so the same avatar opens
 * the same list wherever a host happens to be — plus the two things only this side
 * needs: the way back to the booking site, and language and currency, which the panel's
 * header no longer has room to show as chips.
 *
 * Language and currency dispatch a window event instead of rendering the dialog here.
 * The dialog lives outside this dropdown; nested inside, the menu closing on click
 * would unmount it before it ever painted.
 */
export function HostV2AccountMenu({
  initials,
  userName,
  userEmail,
  isAdmin = false,
  className,
}: {
  initials: string;
  userName?: string | null;
  userEmail?: string | null;
  isAdmin?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const { update } = useSession();
  const i18n = useI18n();
  const display = useDisplayCurrency();
  /*
   * Both rows name what is selected right now, not just what they change. A menu that
   * says only "Currency" makes a host open the dialog to find out what they are
   * looking at; the panel converts prices into this currency, so it is worth a glance.
   * `requestedLocale`, not `locale`: the latter is the catalog locale and reads "en"
   * for any language that is only machine-translated.
   */
  const currentLocale = normalizeLocaleCode(i18n.requestedLocale) ?? "en";
  const currentLanguageName = nativeLanguageName(currentLocale) ?? currentLocale.toUpperCase();

  /*
   * Deferred a frame on purpose. Choosing an item closes the dropdown, and closing it
   * returns focus to the avatar — if the dialog opened in the same tick it would take
   * focus first and then have it pulled back out from under it.
   */
  function openRegionalSettings(tab: "language" | "currency") {
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent(REGIONAL_SETTINGS_OPEN_EVENT, { detail: { tab } })
      );
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-slate-100 text-[0.8125rem] font-semibold text-slate-800 transition-colors hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
            className
          )}
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{userName}</p>
          <p className="notranslate text-xs text-muted-foreground">{userEmail}</p>
        </div>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/account/favorites">
            <Heart className="mr-2 h-4 w-4" />
            <Tx k="header.favorites" source="Favorites" />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/properties">
            <Home className="mr-2 h-4 w-4" />
            <Tx k="header.stays" source="Stays" />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/bookings">
            <CalendarDays className="mr-2 h-4 w-4" />
            <Tx k="header.trips" source="Trips" />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/messages">
            <MessageCircle className="mr-2 h-4 w-4" />
            <Tx k="nav.messages" source="Messages" />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/support">
            <LifeBuoy className="mr-2 h-4 w-4" />
            <Tx k="nav.support_cases" source="Support cases" />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/profile">
            <User className="mr-2 h-4 w-4" />
            <Tx k="header.account" source="Account" />
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          aria-label={`${i18n.resolve("regional.tab_language", "Language and region").text}: ${currentLanguageName}`}
          onSelect={() => openRegionalSettings("language")}
        >
          <Globe className="mr-2 h-4 w-4" />
          <Tx k="regional.tab_language" source="Language and region" />
          {/* The value is decoration for a screen reader — the item already announces
              what it does, and `aria-label` carries the current selection into that
              one sentence rather than leaving two fragments to be read in sequence. */}
          <span
            aria-hidden
            translate="no"
            className="notranslate ml-auto pl-3 text-xs text-muted-foreground"
          >
            {currentLanguageName}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          aria-label={`${i18n.resolve("regional.tab_currency", "Currency").text}: ${currencyDisplayName(display.currency, i18n.locale)}`}
          onSelect={() => openRegionalSettings("currency")}
        >
          <CurrencyMark currency={display.currency} className="mr-2" />
          <Tx k="regional.tab_currency" source="Currency" />
          <span
            aria-hidden
            translate="no"
            className="notranslate ml-auto pl-3 text-xs text-muted-foreground"
          >
            {display.currency}
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/">
            <ArrowLeftRight className="mr-2 h-4 w-4" />
            <Tx k="host.v2.switch_to_booking" source="Switch to booking" />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/host/listings">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <Tx k="header.your_listings" source="Your listings" />
          </Link>
        </DropdownMenuItem>

        {isAdmin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <ShieldCheck className="mr-2 h-4 w-4" />
                <Tx k="header.admin" source="Admin" />
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={(event) => {
            event.preventDefault();
            void (async () => {
              await signOut({ redirect: false });
              await update();
              // Not home. Signing out of the host panel leaves you exactly where a
              // signed-out visitor who clicks "Switch to hosting" ends up — the login
              // screen — rather than dropping you into the booking site's front page.
              router.replace("/login");
            })();
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <Tx k="header.log_out" source="Log out" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A language's own name for itself. Null when the runtime has no data for the code,
 *  which keeps an unrecognized locale from being shown as itself. */
function nativeLanguageName(code: string): string | null {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}
