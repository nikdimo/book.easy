import Link from "next/link";
import { BRAND_TAGLINE, PRODUCT_FAMILY, SITE_DOMAIN } from "@/lib/branding";
import { BrandLogo } from "@/components/shared/brand-logo";

export function Footer() {
  return (
    <footer className="mt-auto border-t bg-muted/30">
      <div className="max-w-[1760px] mx-auto px-4 md:px-8 py-12 md:py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          <div>
            <Link
              href="/"
              className="notranslate flex items-center gap-2 mb-4"
              title={SITE_DOMAIN}
              translate="no"
            >
              <BrandLogo className="h-12" />
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {BRAND_TAGLINE} Book stays on{" "}
              <span className="notranslate" translate="no">
                {SITE_DOMAIN}
              </span>{" "}
              - part of the{" "}
              <span className="notranslate" translate="no">
                {PRODUCT_FAMILY}
              </span>{" "}
              suite of tools.
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
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t bg-background py-8">
        <div className="container mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground max-w-[1760px]">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <span className="notranslate" translate="no">
              Copyright {new Date().getFullYear()} book.easy, Inc.
            </span>
            <Link href="/" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link href="/" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
          </div>
          <div className="flex items-center gap-4 font-medium">
            <span className="hover:text-foreground transition-colors cursor-default">
              EUR
            </span>
            <span className="hover:text-foreground transition-colors cursor-default">
              English (US)
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
