"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPinned } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateMarketplaceSettings } from "@/lib/actions/marketplace-settings.actions";
import { placeKey, placeLabel, type PlaceOption } from "@/lib/utils/place";

export function MarketplaceTab({
  settings,
  markets,
}: {
  settings: {
    featuredMarketEnabled: boolean;
    featuredCity: string;
    featuredCountry: string;
  };
  markets: PlaceOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initialMarket = settings.featuredCity
    ? placeKey({
        city: settings.featuredCity,
        country: settings.featuredCountry,
      })
    : "";
  const [enabled, setEnabled] = useState(settings.featuredMarketEnabled);
  const [selectedMarket, setSelectedMarket] = useState(initialMarket);
  const selected = useMemo(
    () => markets.find((market) => placeKey(market) === selectedMarket),
    [markets, selectedMarket]
  );

  function save() {
    startTransition(async () => {
      const result = await updateMarketplaceSettings({
        featuredMarketEnabled: enabled,
        featuredCity: selected?.city ?? "",
        featuredCountry: selected?.country ?? "",
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Marketplace settings saved");
      router.refresh();
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MapPinned className="size-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-5">
            <div>
              <h2 className="font-semibold">Featured default market</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                When visitors open the properties page without choosing a
                destination, show this market explicitly. Visitors can still
                choose Explore all to see every approved listing.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="featured-market-enabled"
                checked={enabled}
                onCheckedChange={(checked) => setEnabled(checked === true)}
              />
              <Label htmlFor="featured-market-enabled">
                Use a featured market by default
              </Label>
            </div>

            <div className="space-y-2">
              <Label>Market</Label>
              <Select
                value={selectedMarket}
                onValueChange={setSelectedMarket}
                disabled={isPending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a market" />
                </SelectTrigger>
                <SelectContent>
                  {markets.map((market) => (
                    <SelectItem key={placeKey(market)} value={placeKey(market)}>
                      {placeLabel(market)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only destinations with approved listings are available.
              </p>
            </div>

            <Button
              type="button"
              onClick={save}
              disabled={isPending || (enabled && !selected)}
            >
              {isPending ? "Saving…" : "Save marketplace settings"}
            </Button>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        IP-based location is intentionally not used as a hidden search filter.
        It can be added later as a Near you suggestion without changing the
        visible result set.
      </p>
    </div>
  );
}
