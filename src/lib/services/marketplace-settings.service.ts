import "server-only";

import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

export const MARKETPLACE_SETTINGS_TAG = "marketplace-settings";

export interface MarketplaceSettingsValue {
  featuredMarketEnabled: boolean;
  featuredCity: string;
  featuredCountry: string;
}

const DEFAULT_SETTINGS: MarketplaceSettingsValue = {
  featuredMarketEnabled: false,
  featuredCity: "",
  featuredCountry: "",
};

export const getMarketplaceSettings = unstable_cache(
  async (): Promise<MarketplaceSettingsValue> => {
    const settings = await db.marketplaceSettings.findUnique({
      where: { id: "default" },
    });

    if (!settings) return DEFAULT_SETTINGS;
    return {
      featuredMarketEnabled: settings.featuredMarketEnabled,
      featuredCity: settings.featuredCity ?? "",
      featuredCountry: settings.featuredCountry ?? "",
    };
  },
  ["marketplace-settings"],
  { revalidate: 300, tags: [MARKETPLACE_SETTINGS_TAG] }
);
