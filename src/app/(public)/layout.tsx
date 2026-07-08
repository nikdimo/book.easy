import { Suspense } from "react";
import { Header } from "@/components/shared/header";
import { Footer } from "@/components/shared/footer";
import {
  getAvailableCities,
  getAvailablePropertyTypesByCity,
} from "@/lib/services/search.service";

async function HeaderWithPopularCities() {
  let popularCities: string[] = [];
  let availablePropertyTypesByCity: Record<string, string[]> = {};
  try {
    [popularCities, availablePropertyTypesByCity] = await Promise.all([
      getAvailableCities(),
      getAvailablePropertyTypesByCity(),
    ]);
  } catch {
    popularCities = [];
    availablePropertyTypesByCity = {};
  }
  return (
    <Header
      popularCities={popularCities}
      availablePropertyTypesByCity={availablePropertyTypesByCity}
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
