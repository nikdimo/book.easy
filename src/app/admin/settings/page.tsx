import { getAllLanguages } from "@/lib/services/language.service";
import { getAmenityCatalogForAdmin } from "@/lib/services/amenity.service";
import { getAllPropertyTypesForAdmin } from "@/lib/services/property-type.service";
import { getSuggestionsForAdmin } from "@/lib/services/admin.service";
import { getTranslationStatus } from "@/lib/services/ui-translation.service";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LanguagesTab } from "./_components/languages-tab";
import { AmenitiesTab } from "./_components/amenities-tab";
import { PropertyTypesTab } from "./_components/property-types-tab";
import { SuggestionsTab } from "./_components/suggestions-tab";
import { MarketplaceTab } from "./_components/marketplace-tab";
import { getMarketplaceSettings } from "@/lib/services/marketplace-settings.service";
import { getAvailableCities } from "@/lib/services/search.service";

export const metadata = { title: "Admin - Settings" };

const TAB_VALUES = [
  "languages",
  "amenities",
  "property-types",
  "marketplace",
  "suggestions",
] as const;

interface AdminSettingsPageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function AdminSettingsPage({ searchParams }: AdminSettingsPageProps) {
  const { tab } = await searchParams;
  const defaultTab = TAB_VALUES.includes(tab as (typeof TAB_VALUES)[number])
    ? (tab as (typeof TAB_VALUES)[number])
    : "languages";

  const [
    languages,
    amenityCatalog,
    propertyTypes,
    suggestions,
    translationStatus,
    marketplaceSettings,
    markets,
  ] =
    await Promise.all([
      getAllLanguages(),
      getAmenityCatalogForAdmin(),
      getAllPropertyTypesForAdmin(),
      getSuggestionsForAdmin(),
      getTranslationStatus(),
      getMarketplaceSettings(),
      getAvailableCities(),
    ]);

  const languagesKey = languages
    .map(
      (language) =>
        `${language.code}:${language.sortOrder}:${language.isEnabled ? 1 : 0}:${language.useAiTranslation ? 1 : 0}`
    )
    .join("|");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="languages">Languages</TabsTrigger>
          <TabsTrigger value="amenities">Amenities</TabsTrigger>
          <TabsTrigger value="property-types">Property Types</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
          <TabsTrigger value="suggestions">
            Suggestions
            {suggestions.pending.length > 0 ? ` (${suggestions.pending.length})` : ""}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="languages" className="mt-6">
          <LanguagesTab
            key={languagesKey}
            languages={languages}
            translationStatus={translationStatus}
          />
        </TabsContent>
        <TabsContent value="amenities" className="mt-6">
          <AmenitiesTab
            categories={amenityCatalog.categories}
            amenities={amenityCatalog.amenities}
            languages={amenityCatalog.languages}
          />
        </TabsContent>
        <TabsContent value="property-types" className="mt-6">
          <PropertyTypesTab propertyTypes={propertyTypes} />
        </TabsContent>
        <TabsContent value="marketplace" className="mt-6">
          <MarketplaceTab settings={marketplaceSettings} markets={markets} />
        </TabsContent>
        <TabsContent value="suggestions" className="mt-6">
          <SuggestionsTab
            pending={suggestions.pending}
            reviewed={suggestions.reviewed}
            amenityCategories={amenityCatalog.categories}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
