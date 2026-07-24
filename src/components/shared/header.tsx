"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  User,
  Home,
  LogOut,
  LayoutDashboard,
  CalendarDays,
  ShieldCheck,
  SlidersHorizontal,
  Heart,
} from "lucide-react";
import { MarketplaceSearchBar } from "@/components/marketplace/marketplace-search-bar";
import { GoogleTranslateWidget } from "@/components/shared/google-translate-widget";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SITE_DOMAIN } from "@/lib/branding";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import type { PlaceOption } from "@/lib/utils/place";
import type { Resolved } from "@/lib/i18n/t";
import { BrandLogo } from "@/components/shared/brand-logo";

export interface HeaderNavLabels {
  switchToHosting: Resolved;
  stays: Resolved;
  trips: Resolved;
  favorites: Resolved;
  account: Resolved;
  hostingDashboard: Resolved;
  yourListings: Resolved;
  becomeAHost: Resolved;
  admin: Resolved;
  logOut: Resolved;
  logIn: Resolved;
}

const DEFAULT_NAV_LABELS: HeaderNavLabels = {
  switchToHosting: { text: "Switch to hosting", translated: false },
  stays: { text: "Stays", translated: false },
  trips: { text: "Trips", translated: false },
  favorites: { text: "Favorites", translated: false },
  account: { text: "Account", translated: false },
  hostingDashboard: { text: "Hosting dashboard", translated: false },
  yourListings: { text: "Your listings", translated: false },
  becomeAHost: { text: "Become a host", translated: false },
  admin: { text: "Admin", translated: false },
  logOut: { text: "Log out", translated: false },
  logIn: { text: "Log in", translated: false },
};

export function Header({
  popularCities = [],
  availablePropertyTypesByCity = {},
  propertyTypes = [],
  languages = [],
  currentLocale = "en",
  listYourProperty = { text: "List your property", translated: false },
  listYourPropertyTooltip = {
    text: "Start listing your property — takes about 10 minutes.",
    translated: false,
  },
  navLabels = DEFAULT_NAV_LABELS,
}: {
  popularCities?: PlaceOption[];
  availablePropertyTypesByCity?: Record<string, string[]>;
  propertyTypes?: PropertyTypeOption[];
  listYourProperty?: Resolved;
  listYourPropertyTooltip?: Resolved;
  navLabels?: HeaderNavLabels;
  languages?: { code: string; name: string; isDefault: boolean }[];
  currentLocale?: string;
}) {
  const router = useRouter();
  const { data: session, update } = useSession();
  const user = session?.user;
  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const searchDefaults = {
    city: "",
    country: "",
    checkIn: "",
    checkOut: "",
    guests: "",
  };

  async function handleLogout() {
    await signOut({ redirect: false });
    await update();
    router.replace("/");
  }

  return (
    <header className="w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 md:px-8 h-20 grid grid-cols-[auto_1fr_auto] items-center gap-4 max-w-[1760px]">
        <div className="flex items-center min-w-0">
          <Link
            href="/"
            className="notranslate flex items-center shrink-0"
            title={SITE_DOMAIN}
            translate="no"
          >
            <BrandLogo compact className="h-11 2xl:hidden" />
            <BrandLogo className="hidden h-[58px] 2xl:block" />
          </Link>
        </div>

        <div className="flex items-center justify-center min-w-0 px-2">
          <div className="hidden 2xl:flex w-full max-w-3xl items-center justify-center">
            <MarketplaceSearchBar
              variant="pill"
              {...searchDefaults}
              popularCities={popularCities}
              availablePropertyTypesByCity={availablePropertyTypesByCity}
              propertyTypes={propertyTypes}
            />
          </div>

          <div className="flex 2xl:hidden w-full max-w-md items-center justify-center">
            <MarketplaceSearchBar
              variant="summary"
              {...searchDefaults}
              popularCities={popularCities}
              availablePropertyTypesByCity={availablePropertyTypesByCity}
              propertyTypes={propertyTypes}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 min-w-0">
          <GoogleTranslateWidget languages={languages} currentLocale={currentLocale} />
          {user?.isHost ? (
            <Button
              variant="ghost"
              className="hidden 2xl:flex rounded-full text-sm font-medium"
              asChild
            >
              <Link href="/host">
                <span className={navLabels.switchToHosting.translated ? "notranslate" : undefined}>
                  {navLabels.switchToHosting.text}
                </span>
              </Link>
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className="hidden 2xl:flex rounded-full text-sm font-medium"
                  asChild
                >
                  <Link href="/account/become-host">
                    <span className={listYourProperty.translated ? "notranslate" : undefined}>
                      {listYourProperty.text}
                    </span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent
                className={listYourPropertyTooltip.translated ? "notranslate" : undefined}
              >
                {listYourPropertyTooltip.text}
              </TooltipContent>
            </Tooltip>
          )}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 border rounded-full p-1.5 pl-3 hover:shadow-md transition-shadow cursor-pointer bg-background text-left"
                >
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs bg-muted text-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/properties">
                    <Home className="mr-2 h-4 w-4" />
                    <span className={navLabels.stays.translated ? "notranslate" : undefined}>
                      {navLabels.stays.text}
                    </span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/account/bookings">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    <span className={navLabels.trips.translated ? "notranslate" : undefined}>
                      {navLabels.trips.text}
                    </span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/account/favorites">
                    <Heart className="mr-2 h-4 w-4" />
                    <span className={navLabels.favorites.translated ? "notranslate" : undefined}>
                      {navLabels.favorites.text}
                    </span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/account/profile">
                    <User className="mr-2 h-4 w-4" />
                    <span className={navLabels.account.translated ? "notranslate" : undefined}>
                      {navLabels.account.text}
                    </span>
                  </Link>
                </DropdownMenuItem>
                {user.isHost && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/host">
                        <Home className="mr-2 h-4 w-4" />
                        <span
                          className={navLabels.hostingDashboard.translated ? "notranslate" : undefined}
                        >
                          {navLabels.hostingDashboard.text}
                        </span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/host/listings">
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        <span
                          className={navLabels.yourListings.translated ? "notranslate" : undefined}
                        >
                          {navLabels.yourListings.text}
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                {!user.isHost && (
                  <DropdownMenuItem asChild>
                    <Link href="/account/become-host">
                      <Home className="mr-2 h-4 w-4" />
                      <span className={navLabels.becomeAHost.translated ? "notranslate" : undefined}>
                        {navLabels.becomeAHost.text}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                )}
                {user.role === "ADMIN" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/admin">
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        <span className={navLabels.admin.translated ? "notranslate" : undefined}>
                          {navLabels.admin.text}
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={(e) => {
                    e.preventDefault();
                    void handleLogout();
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span className={navLabels.logOut.translated ? "notranslate" : undefined}>
                    {navLabels.logOut.text}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-1">
              <Button size="sm" className="rounded-full font-medium" asChild>
                <Link href="/login">
                  <span className={navLabels.logIn.translated ? "notranslate" : undefined}>
                    {navLabels.logIn.text}
                  </span>
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
