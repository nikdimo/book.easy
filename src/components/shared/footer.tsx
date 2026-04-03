import Link from "next/link";
import { Building2 } from "lucide-react";
import { PRODUCT_FAMILY, PRODUCT_NAME, SITE_DOMAIN } from "@/lib/branding";

export function Footer() {
  return (
    <footer className="mt-auto border-t bg-muted/30">
      <div className="max-w-[1760px] mx-auto px-4 md:px-8 py-12 md:py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          <div>
            <Link href="/" className="flex items-center gap-2 mb-4" title={SITE_DOMAIN}>
              <Building2 className="h-6 w-6 text-primary" />
              <span className="font-semibold text-lg">
                {PRODUCT_NAME}
                <span className="text-muted-foreground font-normal">.{PRODUCT_FAMILY}</span>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Stays and bookings on {SITE_DOMAIN} — part of the {PRODUCT_FAMILY} suite of tools.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-4">Discover</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link href="/properties?city=Ohrid" className="hover:text-foreground transition-colors">
                  Ohrid
                </Link>
              </li>
              <li>
                <Link href="/properties?city=Skopje" className="hover:text-foreground transition-colors">
                  Skopje
                </Link>
              </li>
              <li>
                <Link href="/properties?city=Bitola" className="hover:text-foreground transition-colors">
                  Bitola
                </Link>
              </li>
              <li>
                <Link href="/properties" className="hover:text-foreground transition-colors">
                  Explore all
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-4">Hosting</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link href="/account/become-host" className="hover:text-foreground transition-colors">
                  Become a host
                </Link>
              </li>
              <li>
                <Link href="/host" className="hover:text-foreground transition-colors">
                  Host dashboard
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-4">Account</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link href="/login" className="hover:text-foreground transition-colors">
                  Log in
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-foreground transition-colors">
                  Sign up
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t bg-foreground text-background">
        <div className="max-w-[1760px] mx-auto px-4 md:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs md:text-sm">
          <p className="opacity-90">© {new Date().getFullYear()} {SITE_DOMAIN}</p>
          <div className="flex flex-wrap gap-6 justify-center opacity-90">
            <span className="cursor-default">Privacy</span>
            <span className="cursor-default">Terms</span>
            <span className="cursor-default">Support</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
