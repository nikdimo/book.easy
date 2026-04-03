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
  Menu,
  User,
  Home,
  LogOut,
  LayoutDashboard,
  Building2,
  CalendarDays,
  ShieldCheck,
  Globe,
} from "lucide-react";
import { MarketplaceSearchBar } from "@/components/marketplace/marketplace-search-bar";
import { PRODUCT_FAMILY, PRODUCT_NAME, SITE_DOMAIN } from "@/lib/branding";

export function Header() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const user = session?.user;
  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const searchDefaults = { city: "", checkIn: "", checkOut: "", guests: "" };

  async function handleLogout() {
    await signOut({ redirect: false });
    await update();
    router.replace("/");
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div
        className="mx-auto flex h-[72px] items-center gap-4 px-4 md:px-6 lg:px-8 max-w-[1760px]"
      >
        <Link href="/" className="flex items-center gap-1 shrink-0" title={SITE_DOMAIN}>
          <Building2 className="h-8 w-8 text-primary" />
          <span className="text-lg font-semibold tracking-tight text-foreground">
            {PRODUCT_NAME}
            <span className="text-muted-foreground font-normal">
              .{PRODUCT_FAMILY}
            </span>
          </span>
        </Link>

        <div className="hidden md:flex flex-1 justify-center min-w-0 px-2">
          <MarketplaceSearchBar variant="compact" {...searchDefaults} />
        </div>

        <nav className="hidden lg:flex items-center gap-1 shrink-0 ml-auto">
          <Button variant="ghost" size="sm" className="rounded-full font-medium" asChild>
            <Link href="/properties">Stays</Link>
          </Button>
          {user?.isHost ? (
            <Button variant="ghost" size="sm" className="rounded-full font-medium" asChild>
              <Link href="/host">Switch to hosting</Link>
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="rounded-full font-medium" asChild>
              <Link href="/account/become-host">Become a host</Link>
            </Button>
          )}
        </nav>

        <div className="flex items-center gap-2 shrink-0 ml-auto md:ml-0">
          <Button variant="ghost" size="icon" className="rounded-full hidden sm:flex" aria-label="Language">
            <Globe className="h-5 w-5" />
          </Button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 rounded-full pl-3 pr-1 py-1 h-auto border-border shadow-sm hover:shadow-md transition-shadow"
                >
                  <Menu className="h-4 w-4 ml-1" />
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
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

      <div className="md:hidden border-t px-4 py-3 bg-muted/30">
        <MarketplaceSearchBar variant="compact" {...searchDefaults} />
      </div>
    </header>
  );
}
