import { Suspense } from "react";
import { Header } from "@/components/shared/header";
import { Footer } from "@/components/shared/footer";
import {
  getAvailableCities,
  getAvailablePropertyTypesByCity,
} from "@/lib/services/search.service";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";
import { getEnabledLanguages } from "@/lib/services/language.service";
import { getT, type Resolved } from "@/lib/i18n/t";
import type { HeaderNavLabels } from "@/components/shared/header";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import type { PlaceOption } from "@/lib/utils/place";

function resolveNavLabels(t: Awaited<ReturnType<typeof getT>>): HeaderNavLabels {
  return {
    switchToHosting: t.resolve("header.switch_to_hosting", "Switch to hosting"),
    stays: t.resolve("header.stays", "Stays"),
    trips: t.resolve("header.trips", "Trips"),
    favorites: t.resolve("header.favorites", "Favorites"),
    account: t.resolve("header.account", "Account"),
    hostingDashboard: t.resolve("header.hosting_dashboard", "Hosting dashboard"),
    yourListings: t.resolve("header.your_listings", "Your listings"),
    becomeAHost: t.resolve("header.become_a_host", "Become a host"),
    admin: t.resolve("header.admin", "Admin"),
    logOut: t.resolve("header.log_out", "Log out"),
    logIn: t.resolve("header.log_in", "Log in"),
  };
}

async function HeaderWithPopularCities({ t }: { t: Awaited<ReturnType<typeof getT>> }) {
  let popularCities: PlaceOption[] = [];
  let availablePropertyTypesByCity: Record<string, string[]> = {};
  let propertyTypes: PropertyTypeOption[] = [];
  let languages: Awaited<ReturnType<typeof getEnabledLanguages>> = [];
  // Source text MUST be a string literal here so the translation scanner can extract it.
  let listYourProperty: Resolved = { text: "List your property", translated: false };
  let listYourPropertyTooltip: Resolved = {
    text: "Start listing your property — takes about 10 minutes.",
    translated: false,
  };
  try {
    [popularCities, availablePropertyTypesByCity, propertyTypes, languages] =
      await Promise.all([
        getAvailableCities(),
        getAvailablePropertyTypesByCity(),
        getActivePropertyTypes(),
        getEnabledLanguages(),
      ]);
    listYourProperty = t.resolve("header.list_your_property", "List your property");
    listYourPropertyTooltip = t.resolve(
      "header.list_your_property_tooltip",
      "Start listing your property — takes about 10 minutes."
    );
  } catch {
    popularCities = [];
    availablePropertyTypesByCity = {};
    propertyTypes = [];
    languages = [];
  }
  return (
    <Header
      popularCities={popularCities}
      availablePropertyTypesByCity={availablePropertyTypesByCity}
      propertyTypes={propertyTypes}
      languages={languages}
      currentLocale={t.locale}
      listYourProperty={listYourProperty}
      listYourPropertyTooltip={listYourPropertyTooltip}
      navLabels={resolveNavLabels(t)}
    />
  );
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();

  // Search/picker copy is resolved by `useSearchLabels()` on the client, off the
  // root `I18nProvider` — there is no second provider here.
  return (
    <div className="h-dvh overflow-hidden">
      <div className="h-full overflow-y-auto">
        <Suspense fallback={<div className="h-[72px] border-b bg-background" />}>
          <HeaderWithPopularCities t={t} />
        </Suspense>
        <main>{children}</main>
        <Footer />
      </div>
    </div>
  );
}
