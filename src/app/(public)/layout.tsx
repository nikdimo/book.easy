import { Suspense } from "react";
import { Header } from "@/components/shared/header";
import { Footer } from "@/components/shared/footer";
import {
  getAvailableCities,
  getAvailablePropertyTypesByCity,
} from "@/lib/services/search.service";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";
import { getEnabledLanguages } from "@/lib/services/language.service";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import type { PlaceOption } from "@/lib/utils/place";

async function HeaderWithPopularCities() {
  let popularCities: PlaceOption[] = [];
  let availablePropertyTypesByCity: Record<string, string[]> = {};
  let propertyTypes: PropertyTypeOption[] = [];
  let languages: Awaited<ReturnType<typeof getEnabledLanguages>> = [];
  try {
    [popularCities, availablePropertyTypesByCity, propertyTypes, languages] =
      await Promise.all([
        getAvailableCities(),
        getAvailablePropertyTypesByCity(),
        getActivePropertyTypes(),
        getEnabledLanguages(),
      ]);
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
    />
  );
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden">
      <div className="h-full overflow-y-auto">
        <Suspense fallback={<div className="h-[72px] border-b bg-background" />}>
          <HeaderWithPopularCities />
        </Suspense>
        <main>{children}</main>
        <Footer />
      </div>
    </div>
  );
}
