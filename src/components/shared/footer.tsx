import Link from "next/link";
import { BRAND_TAGLINE, PRODUCT_FAMILY, SITE_DOMAIN } from "@/lib/branding";
import { BrandLogo } from "@/components/shared/brand-logo";
import { getAvailableCities } from "@/lib/services/search.service";
import { getT, ti } from "@/lib/i18n/t";
import { cn } from "@/lib/utils";

/** Cap the footer link list — once inventory spans many cities this stays a short,
 * scannable list rather than growing without bound. */
const MAX_FOOTER_CITIES = 5;

export async function Footer() {
  const [t, cities] = await Promise.all([getT(), getAvailableCities()]);
  const footerCities = cities.slice(0, MAX_FOOTER_CITIES);

  const productDescription = ti(
    t,
    "footer.product_description",
    "Book stays on {site} — part of the {family} suite of tools.",
    { site: SITE_DOMAIN, family: PRODUCT_FAMILY }
  );
  const discover = t.resolve("footer.discover", "Discover");
  const exploreAll = t.resolve("footer.explore_all", "Explore all");
  const hosting = t.resolve("footer.hosting", "Hosting");
  const becomeAHost = t.resolve("footer.become_a_host", "Become a host");
  const hostDashboard = t.resolve("footer.host_dashboard", "Host dashboard");
  const account = t.resolve("footer.account", "Account");
  const logIn = t.resolve("footer.log_in", "Log in");
  const terms = t.resolve("footer.terms", "Terms");
  const privacy = t.resolve("footer.privacy", "Privacy");
  const eur = t.resolve("footer.eur", "EUR");
  const englishUs = t.resolve("footer.english_us", "English (US)");

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
              {BRAND_TAGLINE}{" "}
              <span className={productDescription.translated ? "notranslate" : undefined}>
                {productDescription.text}
              </span>
            </p>
          </div>
          <div>
            <h3
              className={cn("font-semibold text-sm mb-4", discover.translated && "notranslate")}
            >
              {discover.text}
            </h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {footerCities.map((place) => (
                <li key={`${place.city}-${place.country}`}>
                  <Link
                    href={`/properties?city=${encodeURIComponent(place.city)}`}
                    className="hover:text-foreground transition-colors"
                  >
                    {place.city}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/properties"
                  className={cn(
                    "hover:text-foreground transition-colors",
                    exploreAll.translated && "notranslate"
                  )}
                >
                  {exploreAll.text}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3
              className={cn("font-semibold text-sm mb-4", hosting.translated && "notranslate")}
            >
              {hosting.text}
            </h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link
                  href="/account/become-host"
                  className={cn(
                    "hover:text-foreground transition-colors",
                    becomeAHost.translated && "notranslate"
                  )}
                >
                  {becomeAHost.text}
                </Link>
              </li>
              <li>
                <Link
                  href="/host"
                  className={cn(
                    "hover:text-foreground transition-colors",
                    hostDashboard.translated && "notranslate"
                  )}
                >
                  {hostDashboard.text}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3
              className={cn("font-semibold text-sm mb-4", account.translated && "notranslate")}
            >
              {account.text}
            </h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <Link
                  href="/login"
                  className={cn(
                    "hover:text-foreground transition-colors",
                    logIn.translated && "notranslate"
                  )}
                >
                  {logIn.text}
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
            <Link
              href="/"
              className={cn(
                "hover:text-foreground transition-colors",
                terms.translated && "notranslate"
              )}
            >
              {terms.text}
            </Link>
            <Link
              href="/"
              className={cn(
                "hover:text-foreground transition-colors",
                privacy.translated && "notranslate"
              )}
            >
              {privacy.text}
            </Link>
          </div>
          <div className="flex items-center gap-4 font-medium">
            <span
              className={cn(
                "hover:text-foreground transition-colors cursor-default",
                eur.translated && "notranslate"
              )}
            >
              {eur.text}
            </span>
            <span
              className={cn(
                "hover:text-foreground transition-colors cursor-default",
                englishUs.translated && "notranslate"
              )}
            >
              {englishUs.text}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
