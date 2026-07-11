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
} from "lucide-react";
import { MarketplaceSearchBar } from "@/components/marketplace/marketplace-search-bar";
import { SITE_DOMAIN } from "@/lib/branding";
import type { PropertyTypeOption } from "@/lib/types/property-type";

export function Header({
  popularCities = [],
  availablePropertyTypesByCity = {},
  propertyTypes = [],
}: {
  popularCities?: string[];
  availablePropertyTypesByCity?: Record<string, string[]>;
  propertyTypes?: PropertyTypeOption[];
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
      <div className="container mx-auto px-4 md:px-8 h-20 flex items-center justify-between gap-4 max-w-[1760px]">
        <div className="flex-1 shrink-0 flex items-center min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2 text-primary font-bold text-xl tracking-tight shrink-0"
            title={SITE_DOMAIN}
          >
            <span className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
              b.
            </span>
            <span className="hidden min-[400px]:inline">
              book
              <span className="text-foreground">.easy</span>
              <span className="text-muted-foreground font-semibold text-lg">
                .mk
              </span>
            </span>
          </Link>
        </div>

        <div className="hidden 2xl:flex flex-[2] items-center justify-center max-w-3xl min-w-0 px-2">
          <MarketplaceSearchBar
            variant="pill"
            {...searchDefaults}
            popularCities={popularCities}
            availablePropertyTypesByCity={availablePropertyTypesByCity}
            propertyTypes={propertyTypes}
          />
        </div>

        <div className="flex-1 shrink-0 flex items-center justify-end gap-2">
          {user?.isHost ? (
            <Button
              variant="ghost"
              className="hidden 2xl:flex rounded-full text-sm font-medium"
              asChild
            >
              <Link href="/host">Switch to hosting</Link>
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="hidden 2xl:flex rounded-full text-sm font-medium"
              asChild
            >
              <Link href="/account/become-host">List your property</Link>
            </Button>
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
                    Stays
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/account/bookings">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    Trips
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/account/profile">
                    <User className="mr-2 h-4 w-4" />
                    Account
                  </Link>
                </DropdownMenuItem>
                {user.isHost && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/host">
                        <Home className="mr-2 h-4 w-4" />
                        Hosting dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/host/listings">
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        Your listings
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                {!user.isHost && (
                  <DropdownMenuItem asChild>
                    <Link href="/account/become-host">
                      <Home className="mr-2 h-4 w-4" />
                      Become a host
                    </Link>
                  </DropdownMenuItem>
                )}
                {user.role === "ADMIN" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/admin">
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Admin
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
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="rounded-full font-medium" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button size="sm" className="rounded-full font-medium" asChild>
                <Link href="/register">Sign up</Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="2xl:hidden border-t px-4 py-3 bg-background">
        <MarketplaceSearchBar
          variant="summary"
          {...searchDefaults}
          popularCities={popularCities}
          availablePropertyTypesByCity={availablePropertyTypesByCity}
          propertyTypes={propertyTypes}
        />
      </div>
    </header>
  );
}
