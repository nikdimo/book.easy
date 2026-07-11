import { Suspense } from "react";
import { Header } from "@/components/shared/header";
import { Footer } from "@/components/shared/footer";
import {
  getAvailableCities,
  getAvailablePropertyTypesByCity,
} from "@/lib/services/search.service";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";
import type { PropertyTypeOption } from "@/lib/types/property-type";

async function HeaderWithPopularCities() {
  let popularCities: string[] = [];
  let availablePropertyTypesByCity: Record<string, string[]> = {};
  let propertyTypes: PropertyTypeOption[] = [];
  try {
    [popularCities, availablePropertyTypesByCity, propertyTypes] = await Promise.all([
      getAvailableCities(),
      getAvailablePropertyTypesByCity(),
      getActivePropertyTypes(),
    ]);
  } catch {
    popularCities = [];
    availablePropertyTypesByCity = {};
    propertyTypes = [];
  }
  return (
    <Header
      popularCities={popularCities}
      availablePropertyTypesByCity={availablePropertyTypesByCity}
      propertyTypes={propertyTypes}
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
